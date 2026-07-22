// OpenAPI 3 da API. Servido em /swagger (UI) e /swagger.json (spec).

const addressSchema = {
  type: 'object',
  properties: {
    street: { type: 'string', example: 'R. Santa Catarina' },
    number: { type: 'string', example: '1631' },
    neighborhood: { type: 'string', example: 'Lourdes' },
    city: { type: 'string', example: 'Belo Horizonte' },
    uf: { type: 'string', example: 'MG' },
    cep: { type: 'string', example: '30170-081' },
    full: { type: 'string', example: 'R. Santa Catarina, 1631 - Lourdes, Belo Horizonte - MG, 30170-081' },
  },
};

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Maps to Lead — API',
    version: '2.0.0',
    description:
      'API de prospecção de leads a partir do Google Maps. `POST /api/find` inicia a busca ' +
      'e responde na hora com o `jobId`; a extração (rola o feed, extrai, opcionalmente enriquece ' +
      'pelo site e dispara os webhooks) roda em segundo plano. As rotas de `/manager` exigem token ' +
      '(`MANAGER_TOKEN`). **Não apoiamos SPAM — utilize com sabedoria.**',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [
    { name: 'Busca', description: 'Disparo do scraping' },
    { name: 'Painel', description: 'Monitoramento e histórico — requer token' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'MANAGER_TOKEN via `Authorization: Bearer <token>`',
      },
      managerToken: { type: 'apiKey', in: 'header', name: 'X-Manager-Token' },
      queryToken: { type: 'apiKey', in: 'query', name: 'token' },
    },
    schemas: {
      FindRequest: {
        type: 'object',
        required: ['query', 'webhook'],
        properties: {
          query: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', example: 'software', description: 'ramo/palavra-chave' },
              city: { type: 'string', example: 'centro' },
              state: { type: 'string', example: 'rio de janeiro' },
            },
          },
          webhook: {
            type: 'object',
            required: ['url'],
            properties: {
              url: { type: 'string', format: 'uri', example: 'https://webhook.site/xxxx' },
              retry: { type: 'boolean', default: true, description: 'false = sem retentativas' },
              timeout: { type: 'integer', minimum: 1000, maximum: 120000, example: 6000, description: 'timeout por POST (ms)' },
            },
          },
          options: {
            type: 'object',
            properties: {
              onlyWithPhone: { type: 'boolean', default: false, description: 'só empresas com telefone' },
              onlyRepeat: { type: 'boolean', default: true, description: 'false = dedupe por telefone' },
              onlyInfosExtras: { type: 'boolean', default: false, description: 'visita o site do lead (email/redes)' },
            },
          },
        },
      },
      FindResponse: {
        type: 'object',
        properties: {
          error: { type: 'boolean', example: false },
          message: { type: 'string' },
          jobId: { type: 'string', example: 'job_1737500000000_1' },
          query: { type: 'object' },
          options: { type: 'object' },
          webhook: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'boolean', example: true },
          message: { type: 'string' },
        },
      },
      LeadPayload: {
        type: 'object',
        description: 'Payload enviado ao webhook (um por lead).',
        properties: {
          lead: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pic: { type: 'string' },
              rating: {
                type: 'object',
                properties: { note: { type: 'string', example: '4.6' }, quantity: { type: 'integer', example: 403 } },
              },
              address: addressSchema,
              contacts: {
                type: 'object',
                properties: {
                  phone: { type: 'string', example: '+5531999999999' },
                  whatsapp: { type: 'string' },
                  ddd: { type: 'string', example: '31' },
                  email: { type: 'string' },
                },
              },
              social: {
                type: 'object',
                properties: {
                  instagram: { type: 'string' },
                  facebook: { type: 'string' },
                  site: { type: 'string' },
                },
              },
              extra: {
                type: 'object',
                description: 'Preenchido quando options.onlyInfosExtras=true.',
                properties: {
                  site_visitado: { type: 'boolean' },
                  campos_encontrados: { type: 'array', items: { type: 'string' }, example: ['instagram', 'facebook'] },
                  email: { type: 'string' },
                  instagram: { type: 'string' },
                  facebook: { type: 'string' },
                },
              },
            },
          },
        },
      },
      LeadRecord: {
        type: 'object',
        description: 'Lead persistido no SQLite (também exportado no XLSX).',
        properties: {
          jobId: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          ddd: { type: 'string' },
          email: { type: 'string' },
          instagram: { type: 'string' },
          facebook: { type: 'string' },
          website: { type: 'string' },
          street: { type: 'string' },
          number: { type: 'string' },
          neighborhood: { type: 'string' },
          city: { type: 'string' },
          uf: { type: 'string' },
          cep: { type: 'string' },
          address: { type: 'string' },
          rating: { type: 'string' },
          reviews: { type: 'string' },
          score: { type: 'integer' },
          tier: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          siteVisitado: { type: 'boolean' },
          camposEncontrados: { type: 'array', items: { type: 'string' } },
          ms: { type: 'integer', nullable: true },
          at: { type: 'integer', description: 'epoch ms' },
        },
      },
      LeadsPage: {
        type: 'object',
        properties: {
          leads: { type: 'array', items: { $ref: '#/components/schemas/LeadRecord' } },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/api/find': {
      post: {
        tags: ['Busca'],
        summary: 'Inicia uma busca (resposta instantânea)',
        description: 'Cria um job e retorna na hora com o `jobId`. A extração roda em background; os leads chegam no webhook.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FindRequest' } } },
        },
        responses: {
          '200': {
            description: 'Busca iniciada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FindResponse' } } },
          },
          '400': {
            description: 'Body inválido',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/manager/api/state': {
      get: {
        tags: ['Painel'],
        summary: 'Snapshot do painel (KPIs, jobs, leads recentes)',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        responses: {
          '200': { description: 'Snapshot', content: { 'application/json': { schema: { type: 'object' } } } },
          '401': { description: 'Token inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/manager/api/leads': {
      get: {
        tags: ['Painel'],
        summary: 'Leads persistidos (paginado)',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 12, minimum: 1, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
        ],
        responses: {
          '200': { description: 'Página de leads', content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadsPage' } } } },
          '401': { description: 'Token inválido' },
        },
      },
    },
    '/manager/api/leads.xlsx': {
      get: {
        tags: ['Painel'],
        summary: 'Exporta todos os leads em planilha .xlsx',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        responses: {
          '200': {
            description: 'Planilha',
            content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } },
          },
          '401': { description: 'Token inválido' },
        },
      },
    },
    '/manager/api/jobs': {
      get: {
        tags: ['Painel'],
        summary: 'Histórico de jobs (sem leads)',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 200 } }],
        responses: { '200': { description: 'Jobs', content: { 'application/json': { schema: { type: 'object' } } } }, '401': { description: 'Token inválido' } },
      },
    },
    '/manager/api/jobs/{id}/leads': {
      get: {
        tags: ['Painel'],
        summary: 'Leads de um job (paginado)',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, minimum: 1, maximum: 500 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
        ],
        responses: { '200': { description: 'Leads do job', content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadsPage' } } } }, '401': { description: 'Token inválido' } },
      },
    },
    '/manager/stream': {
      get: {
        tags: ['Painel'],
        summary: 'Stream ao vivo (Server-Sent Events)',
        description: 'Empurra um snapshot a cada atualização. Como o EventSource não envia headers, use `?token=`.',
        security: [{ bearerAuth: [] }, { managerToken: [] }, { queryToken: [] }],
        responses: { '200': { description: 'text/event-stream', content: { 'text/event-stream': {} } }, '401': { description: 'Token inválido' } },
      },
    },
  },
};
