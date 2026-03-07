/**
 * Minimal OpenAPI 3.0.3 type definitions.
 *
 * Only the subset needed by our manual spec builder is declared here so we
 * avoid adding an external `openapi-types` dependency.
 */

export namespace OpenAPIV3 {
  export interface Document {
    openapi: string;
    info: InfoObject;
    servers?: ServerObject[];
    tags?: TagObject[];
    paths: Record<string, PathItemObject>;
    components?: ComponentsObject;
  }

  export interface InfoObject {
    title: string;
    version: string;
    description?: string;
  }

  export interface ServerObject {
    url: string;
    description?: string;
  }

  export interface TagObject {
    name: string;
    description?: string;
  }

  export interface ComponentsObject {
    schemas?: Record<string, SchemaObject>;
  }

  export interface PathItemObject {
    get?: OperationObject;
    put?: OperationObject;
    post?: OperationObject;
    delete?: OperationObject;
    patch?: OperationObject;
  }

  export interface OperationObject {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses: Record<string, ResponseObject>;
  }

  export interface ParameterObject {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema: SchemaObject;
    description?: string;
  }

  export interface RequestBodyObject {
    required?: boolean;
    content: Record<string, MediaTypeObject>;
  }

  export interface ResponseObject {
    description: string;
    content?: Record<string, MediaTypeObject>;
  }

  export interface MediaTypeObject {
    schema: SchemaObject | ReferenceObject;
  }

  export interface ReferenceObject {
    $ref: string;
  }

  export interface SchemaObject {
    type?: string;
    format?: string;
    properties?: Record<string, SchemaObject | ReferenceObject>;
    required?: string[];
    items?: SchemaObject | ReferenceObject;
    enum?: readonly string[] | string[];
    default?: unknown;
    nullable?: boolean;
    additionalProperties?: boolean | SchemaObject;
    minLength?: number;
    minimum?: number;
    maximum?: number;
    example?: unknown;
    description?: string;
    $ref?: string;
  }
}
