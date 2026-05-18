---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Security

> This file extends [common/security.md](../common/security.md) with Swift specific content.

## Secret Management

- Use **Keychain Services** for sensitive data (tokens, passwords, keys) — never `UserDefaults`
- Use environment variables or `.xcconfig` files for build-time secrets
- Never hardcode secrets in source — decompilation tools extract them trivially

```swift
let apiKey = ProcessInfo.processInfo.environment["API_KEY"]
guard let apiKey, !apiKey.isEmpty else {
    fatalError("API_KEY not configured")
}
```

## Transport Security

- App Transport Security (ATS) is enforced by default — do not disable it
- Use certificate pinning for critical endpoints
- Validate all server certificates

## Input Validation

- Sanitize all user input before display to prevent injection
- Use `URL(string:)` with validation rather than force-unwrapping
- Validate data from external sources (APIs, deep links, pasteboard) before processing

## Biometric Authentication (LAContext)

```swift
import LocalAuthentication

func authenticateWithBiometric() async throws -> Bool {
    let context = LAContext()
    context.localizedCancelTitle = "Use PIN instead"
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
        throw AuthError.biometricNotAvailable
    }
    return try await context.evaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics,
        localizedReason: "Verify your identity"
    )
}
```

## CryptoKit Encryption

```swift
import CryptoKit

// AES-GCM encryption with CryptoKit
let key = SymmetricKey(size: .bits256)
let sealedBox = try AES.GCM.seal(data, using: key)
let decrypted = try AES.GCM.open(sealedBox, using: key)
```

## Keychain Best Practices

```swift
// Store sensitive data in Keychain, NEVER in UserDefaults
let addQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "auth_token",
    kSecValueData as String: tokenData,
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
]
SecItemAdd(addQuery as CFDictionary, nil)
```

- Always use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for tokens
- Use `kSecAttrAccessControl` with biometric requirement for high-value keys
- Delete Keychain items on logout
- Never store secrets in `UserDefaults` or plist files
