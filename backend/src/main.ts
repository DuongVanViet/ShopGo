import { createApp } from './bootstrap';
import { ENV, Env } from './config/env';

async function main() {
  const app = await createApp();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT, env.HOST);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
