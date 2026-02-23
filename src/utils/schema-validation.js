/**
 * Schema validation utilities for YAML editor.
 * Converts OpenAPI v3 schemas to JSON Schema and creates CodeMirror linter extensions.
 */
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { linter } from '@codemirror/lint'
import YAML from 'yaml'

/**
 * Normalize an OpenAPI v3 schema to JSON Schema draft-07 compatible format.
 * Handles Kubernetes-specific extensions.
 */
export function normalizeSchema(openAPISchema, depth = 0) {
  if (!openAPISchema || typeof openAPISchema !== 'object' || depth > 20) {
    return openAPISchema
  }

  const schema = { ...openAPISchema }

  // Handle x-kubernetes-int-or-string
  if (schema['x-kubernetes-int-or-string']) {
    delete schema['x-kubernetes-int-or-string']
    schema.oneOf = [{ type: 'integer' }, { type: 'string' }]
    delete schema.type
  }

  // Handle x-kubernetes-preserve-unknown-fields
  if (schema['x-kubernetes-preserve-unknown-fields']) {
    delete schema['x-kubernetes-preserve-unknown-fields']
    delete schema.additionalProperties
  }

  // Strip other x-* extensions
  for (const key of Object.keys(schema)) {
    if (key.startsWith('x-')) {
      delete schema[key]
    }
  }

  // Recursively normalize nested schemas
  if (schema.properties) {
    const normalized = {}
    for (const [key, value] of Object.entries(schema.properties)) {
      normalized[key] = normalizeSchema(value, depth + 1)
    }
    schema.properties = normalized
  }

  if (schema.items) {
    schema.items = normalizeSchema(schema.items, depth + 1)
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    schema.additionalProperties = normalizeSchema(schema.additionalProperties, depth + 1)
  }

  if (schema.oneOf) {
    schema.oneOf = schema.oneOf.map(s => normalizeSchema(s, depth + 1))
  }

  if (schema.anyOf) {
    schema.anyOf = schema.anyOf.map(s => normalizeSchema(s, depth + 1))
  }

  if (schema.allOf) {
    schema.allOf = schema.allOf.map(s => normalizeSchema(s, depth + 1))
  }

  return schema
}

/**
 * Create an AJV validator instance with a normalized schema
 */
function createValidator(openAPISchema) {
  const normalized = normalizeSchema(openAPISchema)
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false })
  addFormats(ajv)

  try {
    return ajv.compile(normalized)
  } catch (error) {
    console.warn('Failed to compile schema for validation:', error)
    return null
  }
}

/**
 * Map a JSON path (from ajv error) to a line position in YAML source.
 * Uses the YAML AST to find the position of the errored path.
 */
function pathToPosition(yamlSource, instancePath) {
  if (!instancePath) return { from: 0, to: yamlSource.length }

  const parts = instancePath.split('/').filter(Boolean)

  try {
    const doc = YAML.parseDocument(yamlSource)
    let node = doc.contents

    for (const part of parts) {
      if (!node) break

      if (node.type === 'MAP' || node.type === 'FLOW_MAP') {
        // Find the key-value pair matching this part
        const pair = node.items?.find(item => {
          const keyValue = item.key?.value ?? item.key
          return String(keyValue) === part
        })
        node = pair?.value
      } else if (node.type === 'SEQ' || node.type === 'FLOW_SEQ') {
        const index = parseInt(part, 10)
        node = node.items?.[index]
      } else if (node.items) {
        // Try navigating anyway
        const pair = node.items?.find(item => {
          const keyValue = item.key?.value ?? item.key
          return String(keyValue) === part
        })
        node = pair?.value || node
      } else {
        break
      }
    }

    if (node && node.range) {
      return { from: node.range[0], to: node.range[1] }
    }
  } catch (e) {
    // Fall back to full document
  }

  return { from: 0, to: Math.min(yamlSource.length, 100) }
}

/**
 * Create a CodeMirror linter extension that validates YAML against a schema.
 * If no schema is provided, only YAML syntax validation is performed.
 */
export function createSchemaLinter(openAPISchema) {
  const validate = openAPISchema ? createValidator(openAPISchema) : null

  return linter((view) => {
    const diagnostics = []
    const source = view.state.doc.toString()

    if (!source.trim()) return diagnostics

    // YAML syntax validation
    let parsed
    try {
      parsed = YAML.parse(source)
    } catch (error) {
      // Get position from YAML parse error
      let from = 0
      let to = source.length

      if (error.linePos) {
        const line = error.linePos[0]
        if (line) {
          const lineInfo = view.state.doc.line(Math.min(line.line, view.state.doc.lines))
          from = lineInfo.from + (line.col ? line.col - 1 : 0)
          to = lineInfo.to
        }
      }

      diagnostics.push({
        from,
        to,
        severity: 'error',
        message: `YAML Syntax Error: ${error.message}`
      })
      return diagnostics
    }

    // Schema validation (if schema provided)
    if (validate && parsed) {
      const valid = validate(parsed)
      if (!valid && validate.errors) {
        for (const error of validate.errors) {
          const pos = pathToPosition(source, error.instancePath)
          diagnostics.push({
            from: pos.from,
            to: pos.to,
            severity: 'error',
            message: `${error.instancePath || '/'}: ${error.message}`
          })
        }
      }
    }

    return diagnostics
  }, { delay: 500 })
}
