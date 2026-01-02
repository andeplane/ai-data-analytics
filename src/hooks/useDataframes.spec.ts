import { describe, expect, it } from 'vitest'
import { jsonToCsv } from './useDataframes'

describe(jsonToCsv.name, () => {
  it('should convert array of objects to CSV', () => {
    const json = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('name,age\nAlice,30\nBob,25')
  })

  it('should convert single object to CSV with one row', () => {
    const json = JSON.stringify({ id: 1, value: 'test' })

    const csv = jsonToCsv(json)

    expect(csv).toBe('id,value\n1,test')
  })

  it('should handle objects with multiple columns', () => {
    const json = JSON.stringify([
      { a: 1, b: 2, c: 3, d: 4 },
      { a: 5, b: 6, c: 7, d: 8 },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('a,b,c,d\n1,2,3,4\n5,6,7,8')
  })

  it('should handle null and undefined values as empty strings', () => {
    const json = JSON.stringify([
      { name: 'Alice', value: null },
      { name: 'Bob', value: undefined },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('name,value\nAlice,\nBob,')
  })

  it('should convert nested objects to string representation', () => {
    const json = JSON.stringify([
      { id: 1, data: { nested: true } },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('id,data\n1,[object Object]')
  })

  it('should handle arrays within objects', () => {
    const json = JSON.stringify([
      { id: 1, tags: ['a', 'b', 'c'] },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('id,tags\n1,a,b,c')
  })

  it('should throw error for empty array', () => {
    const json = JSON.stringify([])

    expect(() => jsonToCsv(json)).toThrow('JSON array is empty')
  })

  it('should throw error for invalid JSON', () => {
    expect(() => jsonToCsv('not valid json')).toThrow()
  })

  it('should handle string values with special characters', () => {
    const json = JSON.stringify([
      { name: 'Hello World', description: 'Test value' },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('name,description\nHello World,Test value')
  })

  it('should handle boolean values', () => {
    const json = JSON.stringify([
      { active: true, deleted: false },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('active,deleted\ntrue,false')
  })

  it('should handle numeric values including zero', () => {
    const json = JSON.stringify([
      { count: 0, total: 100, rate: 0.5 },
    ])

    const csv = jsonToCsv(json)

    expect(csv).toBe('count,total,rate\n0,100,0.5')
  })
})

