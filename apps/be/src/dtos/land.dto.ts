import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  fieldCode?: string;

  @IsOptional()
  @IsString()
  commune?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ExternalReportQueryDto {
  @IsOptional()
  @IsString()
  branch?: string;
}

export class SyncSheetDto {
  @IsOptional()
  @IsString()
  sheetUrl?: string;

  @IsOptional()
  @IsString()
  twoTierSheetUrl?: string;

  @IsOptional()
  @IsString()
  vnlisSheetUrl?: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class ImportCsvDto {
  @IsString()
  @IsNotEmpty()
  csvContent!: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}

export class UpsertLandRecordDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reportDate phải có định dạng YYYY-MM-DD',
  })
  reportDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fieldCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  commune?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  parcelCount!: number;

  @IsOptional()
  @IsObject()
  extraData?: Record<string, number | string>;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateFieldDefinitionDto {
  @IsString()
  @Matches(/^[A-Z0-9_]{2,60}$/, {
    message: 'Mã trường chỉ gồm chữ in hoa, số và dấu gạch dưới (VD: MAP_SHEETS)',
  })
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sheetAlias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unit?: string;
}
