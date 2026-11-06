import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

// Serviços digitais (Digitalização e Digitação): em que formato e como o cliente recebe o ficheiro.
export const FORMATOS_ENTREGA = ['PDF', 'IMAGEM', 'WORD'] as const;
export const FORMAS_ENTREGA = ['WHATSAPP', 'PAPELARIA'] as const;

export class CreateOrderDto {
  @IsString()
  externalReference!: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  service!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pageCount!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  copyCount!: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  doubleSided = false;

  @IsOptional()
  @IsIn(FORMATOS_ENTREGA)
  deliveryFormat?: (typeof FORMATOS_ENTREGA)[number];

  @IsOptional()
  @IsIn(FORMAS_ENTREGA)
  deliveryMethod?: (typeof FORMAS_ENTREGA)[number];

  // Intervalo a imprimir, ex.: "3-10". pageCount já é o número de páginas desse intervalo.
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,5}-\d{1,5}$/)
  pageRange?: string;

  // Páginas a cores (ex.: "1, 5, 8-10"); as restantes pagam unitPrice.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  colorPages?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  colorPageCount?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  colorUnitPrice?: number;

  @IsOptional()
  @IsString()
  bindingType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bindingPrice?: number;
}
