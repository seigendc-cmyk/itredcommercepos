# Offline Encryption and Key Management

- SQLite bytes and backup bytes use AES-256-GCM authenticated encryption.
- Each enrolled device receives an operational AES-GCM data key.
- The data key is wrapped using a non-extractable AES-KW device key.
- The browser stores the non-extractable `CryptoKey`; SQLite stores only the wrapped key, public identity label and key version.
- Plaintext operational keys, private keys and passwords are prohibited in SQLite, localStorage, logs and synchronization payloads.
- Device revocation, suspension, expiry, missing keys, invalid keys or authentication-tag failure blocks checkout.
- Key version metadata supports future rotation. Server escrow/recovery and KMS/HSM policy remain deployment responsibilities.
