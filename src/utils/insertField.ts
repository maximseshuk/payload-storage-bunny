import type { InsertPosition } from '@/types/index.js'
import type { Field } from 'payload'

export const insertField = (
  fields: Field[],
  position: InsertPosition,
  fieldToInsert: Field,
): Field[] => {
  if (position === 'first') {
    return [fieldToInsert, ...fields]
  }

  if (position === 'last') {
    return [...fields, fieldToInsert]
  }

  if ('after' in position && position.after) {
    return insertFieldByPath(fields, position.after, fieldToInsert, 'after')
  }

  if ('before' in position && position.before) {
    return insertFieldByPath(fields, position.before, fieldToInsert, 'before')
  }

  return fields
}

const insertFieldByPath = (
  fields: Field[],
  targetPath: string,
  fieldToInsert: Field,
  placement: 'after' | 'before',
): Field[] => {
  const pathParts = targetPath.split('.')
  const [currentPart, ...remainingParts] = pathParts

  if (remainingParts.length === 0) {
    const targetIndex = fields.findIndex(f => 'name' in f && f.name === currentPart)

    if (targetIndex !== -1) {
      const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1
      return [
        ...fields.slice(0, insertIndex),
        fieldToInsert,
        ...fields.slice(insertIndex),
      ]
    }
    return fields
  }

  return fields.map(field => {
    if ('name' in field && field.name === currentPart) {
      const remainingPath = remainingParts.join('.')

      if ('fields' in field && Array.isArray(field.fields)) {
        return {
          ...field,
          fields: insertFieldByPath(field.fields, remainingPath, fieldToInsert, placement),
        }
      }

      if ('tabs' in field && Array.isArray(field.tabs)) {
        const tabIndex = parseInt(remainingParts[0])
        if (!isNaN(tabIndex) && field.tabs[tabIndex]) {
          const tabRemainingPath = remainingParts.slice(1).join('.')
          const updatedTabs = [...field.tabs]

          if ('fields' in updatedTabs[tabIndex] && Array.isArray(updatedTabs[tabIndex].fields)) {
            updatedTabs[tabIndex] = {
              ...updatedTabs[tabIndex],
              fields: insertFieldByPath(
                updatedTabs[tabIndex].fields as Field[],
                tabRemainingPath,
                fieldToInsert,
                placement,
              ),
            }
          }

          return {
            ...field,
            tabs: updatedTabs,
          }
        }
      }
    }

    if ('fields' in field && Array.isArray(field.fields)) {
      const updatedFields = insertFieldByPath(field.fields, targetPath, fieldToInsert, placement)
      if (updatedFields !== field.fields) {
        return { ...field, fields: updatedFields }
      }
    }

    if ('tabs' in field && Array.isArray(field.tabs)) {
      const updatedTabs = field.tabs.map(tab => {
        if ('fields' in tab && Array.isArray(tab.fields)) {
          const updatedFields = insertFieldByPath(tab.fields, targetPath, fieldToInsert, placement)
          if (updatedFields !== tab.fields) {
            return { ...tab, fields: updatedFields }
          }
        }
        return tab
      })

      if (JSON.stringify(updatedTabs) !== JSON.stringify(field.tabs)) {
        return { ...field, tabs: updatedTabs }
      }
    }

    return field
  })
}
