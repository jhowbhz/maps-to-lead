/**
 * Exemplo básico: inicia uma busca e acompanha o progresso ao vivo.
 *
 *   MANAGER_TOKEN=seu-token npx tsx examples/basic.ts
 */
import { MapsToLead, MapsToLeadError } from '../src/index';

async function main(): Promise<void> {
  const client = new MapsToLead({
    baseUrl: process.env.BASE_URL ?? 'http://localhost:9000',
    token: process.env.MANAGER_TOKEN,
  });

  try {
    const job = await client.find({
      query: { type: 'software', city: 'centro', state: 'rio de janeiro' },
      webhook: { url: process.env.WEBHOOK_URL ?? 'https://webhook.site/replace-me' },
      options: { onlyWithPhone: true, onlyRepeat: false },
    });
    console.log('Busca iniciada:', job.jobId);

    // Acompanha o painel ao vivo até o job terminar.
    const ac = new AbortController();
    for await (const snap of client.streamSnapshots({ signal: ac.signal })) {
      console.log(
        `leads=${snap.totals.leads} enviados=${snap.totals.sent} jobs_ativos=${snap.totals.activeJobs}`,
      );
      if (snap.totals.activeJobs === 0) ac.abort();
    }
    console.log('Concluído.');
  } catch (err) {
    if (err instanceof MapsToLeadError) {
      console.error(`Erro HTTP ${err.status}: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

void main();
