import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  externalReference!: string;

  @IsString()
  orderId!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  method!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
