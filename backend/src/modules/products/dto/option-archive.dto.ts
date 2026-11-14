import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { QueryProductDto } from './query-product.dto';

export class OptionArchiveDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class QueryOptionArchiveDto extends QueryProductDto {
  @IsOptional()
  @IsIn(['global', 'branch'])
  scope?: 'global' | 'branch' = 'global';
}
