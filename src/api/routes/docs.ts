import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from '../openapi';

// Documentação interativa (Swagger UI) em /swagger e a spec crua em /swagger.json.
export function docsRouter(): Router {
  const router = Router();
  const spec = openapiSpec as unknown as swaggerUi.JsonObject;

  router.get('/swagger.json', (_req, res) => {
    res.json(openapiSpec);
  });

  router.use(
    '/swagger',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'Maps to Lead — API',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  return router;
}
