import { Controller, Get, Header } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

@Controller('privacy')
export class PrivacyController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  getPolicy() {
    return readFile(join(__dirname, '../../privacy-policy.html'), 'utf8');
  }
}
