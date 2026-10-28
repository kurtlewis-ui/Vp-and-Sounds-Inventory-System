import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// One branch's starting/updated stock for a variant.
export class VariantBranchQtyDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity: number;
}

// Create a new flavor/color for a product. Prices are product-level, so a
// variant only carries a name (+ optional per-branch starting stock).
export class CreateVariantDto {
  @ApiProperty({ example: 'Watermelon' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, type: [VariantBranchQtyDto], description: 'Optional per-branch starting stock' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantBranchQtyDto)
  quantities?: VariantBranchQtyDto[];
}

// Rename a flavor/color.
export class UpdateVariantDto {
  @ApiProperty({ required: false, example: 'Mint' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}
