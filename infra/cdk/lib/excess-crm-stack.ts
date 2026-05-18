import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class ExcessCrmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ──────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ── Security Groups ───────────────────────────────────────────────────────
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', { vpc });
    const redisSg = new ec2.SecurityGroup(this, 'RedisSg', { vpc });
    const appSg = new ec2.SecurityGroup(this, 'AppSg', { vpc, allowAllOutbound: true });

    dbSg.addIngressRule(appSg, ec2.Port.tcp(5432), 'API → Postgres');
    redisSg.addIngressRule(appSg, ec2.Port.tcp(6379), 'API + Worker → Redis');

    // ── RDS Aurora PostgreSQL 16 ──────────────────────────────────────────────
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'excess_app' }),
        generateStringKey: 'password',
        excludeCharacters: '/@"',
      },
    });

    const dbCluster = new rds.DatabaseCluster(this, 'DbCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_1,
      }),
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'excess_crm',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 8,
      storageEncrypted: true,
      deletionProtection: true,
    });

    // ── ElastiCache Redis 7 ───────────────────────────────────────────────────
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Redis subnet group',
      subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
    });

    new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: 'Excess CRM Redis',
      cacheNodeType: 'cache.t4g.small',
      engine: 'redis',
      engineVersion: '7.1',
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSg.securityGroupId],
    });

    // ── S3 for uploads ────────────────────────────────────────────────────────
    new s3.Bucket(this, 'UploadsBucket', {
      bucketName: `excess-crm-uploads-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });

    // ── ECS Cluster ───────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });

    // ── ECR Repositories ──────────────────────────────────────────────────────
    new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'excess-crm/api',
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    new ecr.Repository(this, 'WebRepo', {
      repositoryName: 'excess-crm/web',
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    new ecr.Repository(this, 'WorkerRepo', {
      repositoryName: 'excess-crm/worker',
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DbEndpoint', { value: dbCluster.clusterEndpoint.hostname });
    new cdk.CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
  }
}
