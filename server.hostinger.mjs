// Entry point for the isolated logistics application; no credentials embedded.
process.env.LOGISTICS_PUBLIC_ORIGIN??='https://logistica.distrihub.com.br';
await import('./server.mjs');
