import { db, closeDatabase } from '../src/db/index.js';
import { resumes } from '../src/db/schema.js';
import { DocumentStorageService } from '../src/services/document-storage.service.js';
import { eq } from 'drizzle-orm';

async function main() {
  const tenantId = '24d53f53-780e-4431-b065-32180c354175';
  const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const resumeId = 'fb8d151d-4282-4471-bd18-67e5b4a60a2a';

  const existing = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  if (existing.length > 0) {
    console.log('Base resume already exists:', existing[0].id);
    await closeDatabase();
    return;
  }

  const storage = new DocumentStorageService();
  const rawBytes = Buffer.from('Vishwanath Nishad Authentic Master Resume Document');
  const stored = await storage.storeEncryptedDocument({
    tenantId,
    candidateId,
    buffer: rawBytes,
  });

  const [inserted] = await db
    .insert(resumes)
    .values({
      id: resumeId,
      tenantId,
      candidateId,
      version: 1,
      fileName: 'Vishwanath_Nishad_Resume.pdf',
      mimeType: 'application/pdf',
      ...stored,
      isBaseResume: true,
      lifecycleState: 'BASE_RESUME',
      metadata: {
        source: 'CANONICAL_MASTER_SEED',
        seededAt: new Date().toISOString(),
      },
    })
    .returning();

  console.log('Successfully seeded base resume:', inserted.id, 'state:', inserted.lifecycleState);
  await closeDatabase();
}

main().catch((err) => {
  console.error('Failed to seed base resume:', err);
  process.exit(1);
});
