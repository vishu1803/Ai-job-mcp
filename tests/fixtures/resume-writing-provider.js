/** Deterministic synthetic provider for CI and document acceptance. No network. */
export function fixtureProvider(change = (data) => data, id = 'gemini-vertex') {
  return {
    id,
    generateStructured: async (request) => {
      const facts = request.candidateFacts.facts;
      const fullstack = request.candidateFacts.targetJob.targetTitle.includes('Full');
      const chosen =
        facts.find((f) =>
          fullstack ? /Created React forms/.test(f.text) : /Implemented book search/.test(f.text)
        ) || facts[0];
      if (request.taskType === 'RESUME_SUMMARY_SYNTHESIS')
        return {
          provider: id,
          modelId: 'fixture-only',
          data: change({
            summaryText: fullstack
              ? 'Created event registration forms using React.'
              : 'Developed book search and lending endpoints in Node.js.',
            composedFromFactIds: [chosen.factId],
          }),
        };
      const bullets = facts
        .filter((f) =>
          /Implemented book search|Added PostgreSQL migrations|Created React forms|Connected event forms/.test(
            f.text
          )
        )
        .slice(0, 2)
        .map((f) => ({
          text: f.text.replace('Implemented book search', 'Developed book search'),
          factIds: [f.factId],
          transformationType: 'REWRITE',
        }));
      return {
        provider: id,
        modelId: 'fixture-only',
        data: change({
          bullets: bullets.length
            ? bullets
            : [{ text: chosen.text, factIds: [chosen.factId], transformationType: 'VERBATIM' }],
        }),
      };
    },
  };
}
