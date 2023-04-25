import { oas31 } from 'openapi3-ts';
import { AnyZodObject, ZodRawShape, ZodType } from 'zod';

import { ComponentsObject, createComponentResponseRef } from './components';
import { createContent } from './content';
import {
  ZodOpenApiResponseObject,
  ZodOpenApiResponsesObject,
} from './document';
import { createSchemaOrRef } from './schema';
import { isISpecificationExtension } from './specificationExtension';

export const createResponseHeaders = (
  responseHeaders: AnyZodObject | undefined,
  components: ComponentsObject,
): oas31.ResponseObject['headers'] => {
  if (!responseHeaders) {
    return undefined;
  }

  return Object.entries(responseHeaders.shape as ZodRawShape).reduce<
    NonNullable<oas31.ResponseObject['headers']>
  >((acc, [key, zodSchema]: [string, ZodType]) => {
    acc[key] = createHeaderOrRef(zodSchema, components);
    return acc;
  }, {});
};

export const createHeaderOrRef = (
  schema: ZodType,
  components: ComponentsObject,
): oas31.BaseParameterObject | oas31.ReferenceObject => {
  const component = components.headers.get(schema);
  if (component && component.type === 'complete') {
    return {
      $ref: createComponentHeaderRef(component.ref),
    };
  }

  // Optional Objects can return a reference object
  const baseHeader = createBaseHeader(schema, components);
  if ('$ref' in baseHeader) {
    throw new Error('Unexpected Error: received a reference object');
  }

  const ref = schema._def?.openapi?.header?.ref ?? component?.ref;

  if (ref) {
    components.headers.set(schema, {
      type: 'complete',
      headerObject: baseHeader,
      ref,
    });
    return {
      $ref: createComponentHeaderRef(ref),
    };
  }

  return baseHeader;
};

export const createBaseHeader = (
  schema: ZodType,
  components: ComponentsObject,
): oas31.BaseParameterObject => {
  const { ref, ...rest } = schema._def.openapi?.header ?? {};
  const schemaOrRef = createSchemaOrRef(schema, {
    components,
    type: 'input',
  });
  const required = !schema.isOptional();
  return {
    ...rest,
    ...(schema && { schema: schemaOrRef }),
    ...(required && { required }),
  };
};

export const createComponentHeaderRef = (ref: string) =>
  `#/components/headers/${ref}`;

const createHeaders = (
  headers: oas31.ResponseObject['headers'],
  responseHeaders: AnyZodObject | undefined,
  components: ComponentsObject,
): oas31.ResponseObject['headers'] => {
  if (!responseHeaders && !headers) {
    return undefined;
  }

  const createdHeaders = createResponseHeaders(responseHeaders, components);

  return {
    ...headers,
    ...createdHeaders,
  };
};

export const createResponse = (
  responseObject: ZodOpenApiResponseObject | oas31.ReferenceObject,
  components: ComponentsObject,
): oas31.ResponseObject | oas31.ReferenceObject => {
  if ('$ref' in responseObject) {
    return responseObject;
  }

  const component = components.responses.get(responseObject);
  if (component && component.type === 'complete') {
    return { $ref: createComponentResponseRef(component.ref) };
  }

  const { content, headers, responseHeaders, ref, ...rest } = responseObject;

  const maybeHeaders = createHeaders(headers, responseHeaders, components);

  const response: oas31.ResponseObject = {
    ...rest,
    ...(maybeHeaders && { headers: maybeHeaders }),
    ...(content && { content: createContent(content, components, 'output') }),
  };

  const responseRef = ref ?? component?.ref;

  if (responseRef) {
    components.responses.set(responseObject, {
      responseObject: response,
      ref: responseRef,
      type: 'complete',
    });
    return {
      $ref: createComponentResponseRef(responseRef),
    };
  }

  return response;
};

export const createResponses = (
  responsesObject: ZodOpenApiResponsesObject,
  components: ComponentsObject,
): oas31.ResponsesObject =>
  Object.entries(responsesObject).reduce<oas31.ResponsesObject>(
    (
      acc,
      [path, responseObject]: [
        string,
        ZodOpenApiResponseObject | oas31.ReferenceObject,
      ],
    ): oas31.ResponsesObject => {
      if (isISpecificationExtension(path)) {
        acc[path] = responseObject;
        return acc;
      }
      acc[path] = createResponse(responseObject, components);
      return acc;
    },
    {},
  );
