/**
 * Exemplo (JavaScript/ESM): pagina todos os leads persistidos e exporta o .xlsx.
 *
 *   MANAGER_TOKEN=seu-token node examples/export-leads.mjs
 */
import { writeFile } from 'node:fs/promises';
import { MapsToLead } from '@jhowbhz/maps-to-lead';

const client = new MapsToLead({
  baseUrl: process.env.BASE_URL ?? 'http://localhost:9000',
  token: process.env.MANAGER_TOKEN,
});

// Pagina todos os leads (12 por página).
let offset = 0;
const pageSize = 12;
let total = Infinity;
while (offset < total) {
  const page = await client.getLeads({ limit: pageSize, offset });
  total = page.total;
  for (const lead of page.leads) {
    console.log(`${lead.name}\t${lead.phone}\tscore=${lead.score} (${lead.tier})`);
  }
  offset += pageSize;
}

// Exporta a planilha completa.
await writeFile('leads.xlsx', await client.exportLeadsXlsx());
console.log('Planilha salva em leads.xlsx');
