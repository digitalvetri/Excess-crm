import type { Job } from 'bullmq';
import PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma, withSystemContext } from '@excess/db';
import { env } from '@excess/config';
import pino from 'pino';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const s3 = new S3Client({ region: env.AWS_REGION });

export interface PdfRenderPayload {
  quotationId: string;
  tenantId: string;
}

export async function processPdfRender(job: Job<PdfRenderPayload>): Promise<void> {
  const { quotationId, tenantId } = job.data;

  const quotation = await withSystemContext(prisma, tenantId, (tx) =>
    tx.quotation.findUnique({
      where: { id: quotationId },
      include: { lead: { select: { name: true, phone: true, email: true, city: true } } },
    }),
  );

  if (!quotation) {
    log.warn({ quotationId, tenantId }, 'pdf_render.quotation_not_found');
    return;
  }

  const pdfBuffer = await buildPdf(quotation);

  const s3Key = `quotations/${tenantId}/${quotationId}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET_QUOTATIONS,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }),
  );

  await withSystemContext(prisma, tenantId, (tx) =>
    tx.quotation.update({ where: { id: quotationId }, data: { pdfS3Key: s3Key } }),
  );

  log.info({ quotationId, tenantId, s3Key }, 'pdf_render.complete');
}

interface QuotationForPdf {
  number: string;
  systemKw: { toNumber(): number } | number;
  brandTier: string;
  totalInr: { toNumber(): number } | number;
  subsidyInr: { toNumber(): number } | number;
  netPayable: { toNumber(): number } | number;
  emiMonthly: ({ toNumber(): number } | number) | null;
  paybackYears: ({ toNumber(): number } | number) | null;
  createdAt: Date;
  lead: { name: string; phone: string; email: string | null; city: string | null };
}

function toNum(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

async function buildPdf(q: QuotationForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(20)
      .fillColor('#0F4C81')
      .text('Excess Renew Tech Pvt Ltd', { align: 'center' })
      .fontSize(10)
      .fillColor('#5D6D7E')
      .text('Solar Energy Solutions', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(14)
      .fillColor('#1A1A1A')
      .text(`Quotation: ${q.number}`, { align: 'center' })
      .moveDown(1);

    // Customer details
    doc.fontSize(11).fillColor('#0F4C81').text('Customer Details').moveDown(0.3);
    doc.fontSize(10).fillColor('#1A1A1A');
    doc.text(`Name: ${q.lead.name}`);
    doc.text(`Phone: ${q.lead.phone}`);
    if (q.lead.email) doc.text(`Email: ${q.lead.email}`);
    if (q.lead.city) doc.text(`City: ${q.lead.city}`);
    doc.moveDown(1);

    // System details
    doc.fontSize(11).fillColor('#0F4C81').text('System Details').moveDown(0.3);
    doc.fontSize(10).fillColor('#1A1A1A');
    doc.text(`System Capacity: ${toNum(q.systemKw)} kW`);
    doc.text(`Brand Tier: ${q.brandTier}`);
    doc.text(`Date: ${q.createdAt.toLocaleDateString('en-IN')}`);
    doc.moveDown(1);

    // Pricing
    doc.fontSize(11).fillColor('#0F4C81').text('Pricing Summary').moveDown(0.3);
    doc.fontSize(10).fillColor('#1A1A1A');
    doc.text(`Total System Cost: ₹${toNum(q.totalInr).toLocaleString('en-IN')}`);
    doc.text(`MNRE Subsidy: ₹${toNum(q.subsidyInr).toLocaleString('en-IN')}`);
    doc
      .fontSize(12)
      .fillColor('#27AE60')
      .text(`Net Payable: ₹${toNum(q.netPayable).toLocaleString('en-IN')}`);
    doc.fontSize(10).fillColor('#1A1A1A');
    if (q.emiMonthly) {
      doc.text(`EMI (approx): ₹${toNum(q.emiMonthly!).toLocaleString('en-IN')}/month`);
    }
    if (q.paybackYears) {
      doc.text(`Payback Period: ${toNum(q.paybackYears)} years`);
    }
    doc.moveDown(1);

    // Footer
    doc
      .fontSize(8)
      .fillColor('#5D6D7E')
      .text('This quotation is valid for 30 days. Prices subject to change without notice.', {
        align: 'center',
      });

    doc.end();
  });
}
