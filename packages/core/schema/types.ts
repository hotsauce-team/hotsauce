// Core types for schema introspection

// Re-export Drizzle's types for use in introspection
export { Table } from 'drizzle-orm';
export type { AnyColumn as Column } from 'drizzle-orm';

/**
 * Metadata extracted from a Drizzle column
 */
export interface IntrospectedColumn {
  /** Column name in the database (snake_case) */
  name: string;

  /** Property name in Drizzle schema (camelCase) */
  propertyName: string;

  /** Drizzle column type (PgVarchar, PgText, PgInteger, etc.) */
  columnType: string;

  /** TypeScript data type (string, number, boolean, date, etc.) */
  dataType: string;

  /** Whether the column has a NOT NULL constraint */
  notNull: boolean;

  /** Whether the column has a default value */
  hasDefault: boolean;

  /** Whether this is the primary key */
  isPrimaryKey: boolean;

  /** Whether the column has a unique constraint */
  isUnique: boolean;

  /** Max length for varchar columns */
  maxLength?: number;

  /** Enum values if this is an enum column */
  enumValues?: readonly string[];

  /** Enum name if this is an enum column */
  enumName?: string;

  /** Whether this is an array column (Postgres arrays) */
  isArray?: boolean;

  /** Foreign key reference if this column references another table */
  references?: {
    table: string;
    column: string;
  };
}

/**
 * Metadata extracted from a Drizzle table
 */
export interface IntrospectedTable {
  /** Table name in the database */
  name: string;

  /** All columns in the table */
  columns: IntrospectedColumn[];

  /** Primary key column name(s) */
  primaryKey: string[];

  /** Reference to the original Drizzle table object */
  table: unknown;

  /** Whether this table is a junction table for many-to-many relations */
  isJunction?: boolean;
}

/**
 * Represents a junction (link) table for many-to-many relations
 */
export interface JunctionTable {
  /** The junction table name */
  tableName: string;

  /** First related table */
  leftTable: string;
  /** FK column pointing to left table (propertyName) */
  leftColumn: string;

  /** Second related table */
  rightTable: string;
  /** FK column pointing to right table (propertyName) */
  rightColumn: string;
}

/**
 * Many-to-many relation metadata attached to a table
 */
export interface ManyToManyRelation {
  /** The related table (the "other side" of the M2M) */
  relatedTable: string;
  /** The junction table info */
  junction: JunctionTable;
}

/**
 * Type of relation between tables
 */
export type RelationType = 'one' | 'many';

/**
 * Metadata extracted from a Drizzle relation
 */
export interface IntrospectedRelation {
  /** Name of this relation (as defined in the relations config) */
  name: string;

  /** The source table name */
  sourceTable: string;

  /** The target/related table name */
  targetTable: string;

  /** Type of relation: 'one' (belongs-to) or 'many' (has-many) */
  type: RelationType;

  /** Source column(s) that form the relation (foreign key columns) */
  sourceColumns?: string[];

  /** Target column(s) that are referenced */
  targetColumns?: string[];
}

/**
 * Full schema introspection result including tables and relations
 */
export interface IntrospectedSchema {
  /** All tables in the schema */
  tables: IntrospectedTable[];

  /** All relations defined in the schema */
  relations: IntrospectedRelation[];

  /** Detected junction tables for many-to-many relations */
  junctions: JunctionTable[];
}
