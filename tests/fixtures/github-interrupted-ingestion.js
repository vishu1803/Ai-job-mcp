// Disposable database child-process fixture. Killed after the real extractor reserves its epoch.
import { GitHubEvidenceExtractorService } from '../../src/extractors/github/github-evidence-extractor.js';
const params = JSON.parse(process.argv[2]);
await new GitHubEvidenceExtractorService().extractRepositoryEvidence({
  ...params,
  credentials: { installationId: params.installationId },
  connector: {
    getRepository: async () => {
      process.send('epoch-reserved');
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    },
  },
});
