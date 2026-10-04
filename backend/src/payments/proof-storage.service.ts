import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

@Injectable()
export class ProofStorageService {
  private readonly client?: S3Client;
  private readonly bucket?: string;
  private readonly localDirectory?: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    const settings = [accountId, accessKeyId, secretAccessKey, bucket];
    const configuredCount = settings.filter(Boolean).length;

    if (configuredCount > 0 && configuredCount < settings.length) {
      throw new Error('Configure todas as variáveis R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME.');
    }

    if (configuredCount === settings.length) {
      this.bucket = bucket;
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      });
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configure o armazenamento R2 antes de iniciar o backend em produção.');
    }

    this.localDirectory = resolve(
      process.env.PAYMENT_PROOFS_DIR?.trim() || join(process.cwd(), 'storage', 'payment-proofs'),
    );
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (this.client && this.bucket) {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
      return;
    }

    const path = this.localPath(key);
    await mkdir(this.localDirectory!, { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
  }

  async get(key: string) {
    if (this.client && this.bucket) {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new Error(`O objeto ${key} não tem conteúdo.`);
      return Buffer.from(await response.Body.transformToByteArray());
    }

    return readFile(this.localPath(key));
  }

  async delete(key: string) {
    if (this.client && this.bucket) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }

    await unlink(this.localPath(key));
  }

  private localPath(key: string) {
    return join(this.localDirectory!, key);
  }
}
