/**
 * Shared resource utility functions
 */

/**
 * Strip managed fields from a Kubernetes resource for manifest mode editing.
 * Returns a deep clone with status, managed metadata, and empty annotations/labels removed.
 */
export const stripManagedFields = (resource) => {
  if (!resource) return null

  const cleaned = JSON.parse(JSON.stringify(resource)) // Deep clone

  // Remove status entirely
  delete cleaned.status

  // Clean metadata
  if (cleaned.metadata) {
    delete cleaned.metadata.resourceVersion
    delete cleaned.metadata.uid
    delete cleaned.metadata.generation
    delete cleaned.metadata.creationTimestamp
    delete cleaned.metadata.deletionTimestamp
    delete cleaned.metadata.deletionGracePeriodSeconds
    delete cleaned.metadata.managedFields
    delete cleaned.metadata.selfLink
    delete cleaned.metadata.ownerReferences

    // Clean empty annotations/labels
    if (cleaned.metadata.annotations && Object.keys(cleaned.metadata.annotations).length === 0) {
      delete cleaned.metadata.annotations
    }
    if (cleaned.metadata.labels && Object.keys(cleaned.metadata.labels).length === 0) {
      delete cleaned.metadata.labels
    }
  }

  return cleaned
}

/**
 * Prepare a resource for cloning.
 * Deep clones the resource, strips server-managed fields, and appends '-copy' to the name.
 */
export const prepareForClone = (resource) => {
  if (!resource) return null

  const cloned = stripManagedFields(resource)

  // Append '-copy' to name
  if (cloned.metadata?.name) {
    cloned.metadata.name = `${cloned.metadata.name}-copy`
  }

  // Remove fields that must be unique per resource
  if (cloned.metadata) {
    delete cloned.metadata.resourceVersion
    delete cloned.metadata.uid
    delete cloned.metadata.creationTimestamp
    delete cloned.metadata.generation
    delete cloned.metadata.selfLink
    delete cloned.metadata.managedFields
    delete cloned.metadata.ownerReferences
  }

  return cloned
}
