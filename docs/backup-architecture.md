# Independent Backup & Envelope Encryption Architecture

**Document ID**: `ARCH-056` / `BACKUP-ARCH-001`  
**Phase**: Phase 14 (Security Hardening & Production Readiness)  
**Standard**: Authenticated AES-256-GCM Envelope Encryption & SHA-256 Checksum Manifests  
**Classification**: Technical Architecture Specification  

---

## 1. Overview & Problem Statement

While Aiven provides primary managed base backups and 10-day Point-In-Time-Recovery (PITR) for PostgreSQL, the application requires **secondary vendor-independent disaster recovery** for three reasons:

1. **Document Storage Independence**: Raw uploaded source resumes (`storage/documents/<tenantId>/<storageKey>.enc`) reside on the application filesystem and are **not** stored within PostgreSQL tables.
2. **Cross-Cloud Portability & Anti-Lock-In**: In the event of catastrophic account loss, regional cloud outage, or planned migration to AWS / GCP / bare metal, the application must be restorable onto any standard PostgreSQL instance.
3. **Defense-in-Depth Cryptographic Isolation**: Backups leaving the host machine must be cryptographically protected with authenticated envelope encryption prior to transit and storage.

---

## 2. Backup Package Directory Structure

Backups are structured into discrete, verifiable components rather than a single uncontrolled monolith:

```
storage/backups/<backup-id>/
├── manifest.json                  # Master package manifest with holistic package SHA-256 checksum
├── database/
│   ├── database.dump.enc          # Authenticated AES-256-GCM encrypted database export
│   └── manifest.json              # Database metadata, schema migration level, table row counts
└── documents/
    ├── manifest.json              # Document inventory, tenant mappings, file hashes
    └── <tenantId>/
        └── <storageKey>.enc       # Pre-encrypted binary resume ciphertext (preserved without decrypting)
```

---

## 3. Cryptographic Envelope Encryption Specification

### 3.1 Algorithm & Payload Layout
All database dumps are encrypted using **AES-256-GCM (Galois/Counter Mode)** with authenticated encryption:

```
+---------------------------------------------------------------------------------------+
|                             ENCRYPTED PAYLOAD ENVELOPE                                |
+------------------------------------+------------------------------------+-------------+
|  Initialization Vector (IV)        |  Authentication Tag (AuthTag)      |  Ciphertext |
|  12 Bytes (96 bits)                |  16 Bytes (128 bits)               |  Variable   |
|  crypto.randomBytes(12)            |  cipher.getAuthTag()               |             |
+------------------------------------+------------------------------------+-------------+
```

### 3.2 Key Derivation & Key Versioning
- **Key Version**: Explicitly recorded in manifests (e.g. `keyVersion: "v1"`).
- **Derivation**: `SHA-256(rawMasterKey)` yields a uniform 256-bit symmetric key.
- **Envelope Decryption Rules**:
  - The first 12 bytes are sliced as the IV.
  - The next 16 bytes are sliced as the authentication tag.
  - The remainder is decrypted and authenticated in a single streaming pass.
  - If the auth tag does not match or an invalid key is provided, decryption fails immediately with `DECRYPTION_FAILED` before any plaintext is released.

### 3.3 Zero Key Exposure
- Raw encryption keys are never stored inside backup packages or manifests.
- Manifests record only the `keyVersion`, `encryptionAlgorithm`, and SHA-256 digest of the encrypted ciphertext.

---

## 4. Document Storage Snapshotting Model

- **Ciphertext Preservation**: Document blobs stored under `storage/documents/<tenantId>/<storageKey>.enc` are already encrypted at rest with per-document random IVs and AES-256-GCM.
- **Zero Decryption on Backup**: Document files are copied **as ciphertext** directly into the backup package.
- **Tenant Integrity**: Manifest records the `tenantId`, `storageKey`, `sizeBytes`, and SHA-256 hash of each blob.

---

## 5. Offsite Object Storage & Retention Policy

### 5.1 Recommended Storage Target: Cloudflare R2 / AWS S3
- **Storage Tier**: Private S3-compatible bucket with Object Lock (WORM - Write Once Read Many) enabled.
- **Encryption at Rest**: Server-Side Encryption with KMS (`SSE-KMS` or `SSE-S3`) providing double-layer encryption (client-side AES-256-GCM + server-side KMS).
- **Access Control**: IAM role with least-privilege `s3:PutObject` and `s3:GetObject` restricted strictly to the backup service principal. No bucket deletion permissions granted.

### 5.2 Independent Retention Policy Schedule
To maintain bounded storage costs while providing long-term auditability:

| Backup Frequency | Retention Count | Total Retained Copies | Window Covered |
| :--- | :--- | :--- | :--- |
| **Daily Logical Export** | 7 copies | 7 packages | Past 7 days |
| **Weekly Snapshot** | 4 copies | 4 packages | Past 4 weeks |
| **Monthly Archive** | 3 copies | 3 packages | Past 3 months |
| **Total Retained** | — | **14 packages maximum** | Up to 90 days |

---

## 6. Storage Growth & Cost Projections

Based on current staging measurements ($14.24\text{ MB}$ DB dump $\to \approx 3.2\text{ MB}$ compressed/encrypted + $0.11\text{ MB}$ documents $\approx 3.3\text{ MB}$ per package):

$$\text{Daily Package Size} \approx 3.5\text{ MB}$$

| Time Horizon | Active Packages | Estimated Stored Data | Estimated Cloudflare R2 / S3 Cost |
| :--- | :--- | :--- | :--- |
| **Daily (7 days)** | 7 | $7 \times 3.5\text{ MB} = 24.5\text{ MB}$ | $\$0.00$ (Included in free tier) |
| **Monthly (14 active packages)** | 14 | $14 \times 3.5\text{ MB} = 49.0\text{ MB}$ | $\$0.00$ (Included in free tier) |
| **Annual (with 1.0 MB/day growth)** | 14 | $14 \times 18.0\text{ MB} \approx 252\text{ MB}$ | $< \$0.01 / \text{month}$ |

> [!TIP]
> The total storage footprint of 14 independent backup packages is under **300 MB per year**, representing negligible operational cost while providing complete disaster independence.

---

## 7. Package Verification & Tamper Detection Matrix

| Verification Check | Verification Step | Failure Action |
| :--- | :--- | :--- |
| **File Existence** | Every entry in `manifest.files` exists on disk | Reject restore with `MISSING_BACKUP_FILE` |
| **File Checksums** | SHA-256 hash of each file matches `manifest.files[].sha256` | Reject restore with `CHECKSUM_MISMATCH` |
| **Package Checksum** | SHA-256 of master manifest matches `packageChecksum` | Reject restore with `MALFORMED_MANIFEST` |
| **Key Version Match** | Key version matches active decryption key identifier | Reject restore with `KEY_VERSION_MISMATCH` |
| **Decryption Auth Tag** | AES-256-GCM auth tag validates ciphertext integrity | Reject restore with `DECRYPTION_FAILED` |
| **Document Decryptability** | Test document decodes to expected plaintext SHA-256 | Flag drill failure and trigger high-priority alert |
