import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // TODO: someone said we need "shutdown hooks" for Kubernetes. Not sure what that means.
  await app.listen(3000);
  console.log('server started on 3000');
}
bootstrap();
