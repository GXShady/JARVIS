import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openMemory } from '../bridge/memory.mjs'
import { openSkills, parseSkill } from '../bridge/skills.mjs'
import { decideTool } from '../bridge/policy.mjs'

const fresh = (tag) => mkdtempSync(join(tmpdir(), `jarvis-${tag}-`))

test('a remembered fact survives into a new store on the same folder', () => {
  const dir = fresh('mem')
  const { entry, status } = openMemory(dir).remember('Their sister Maya lives in Lisbon.', { category: 'person' })
  assert.equal(status, 'saved')
  const again = openMemory(dir)
  assert.equal(again.count(), 1)
  assert.match(again.prompt(), /Maya lives in Lisbon/)
  assert.match(again.prompt(), new RegExp(`\\[${entry.id}\\]`))
})

test('the same fact twice is one memory, and a replacement rewrites in place', () => {
  const m = openMemory(fresh('mem'))
  const first = m.remember('They live in Berlin.').entry
  assert.equal(m.remember('  they live in berlin ').status, 'duplicate')
  assert.equal(m.remember('They live in Munich.', { replaces: first.id }).status, 'replaced')
  assert.equal(m.count(), 1)
  assert.equal(m.recall('munich')[0].id, first.id)
  assert.equal(m.recall('berlin').length, 0)
})

test('recall ranks by matching words and returns the latest for no query', () => {
  const m = openMemory(fresh('mem'))
  m.remember('Their dog is called Bruno.')
  m.remember('They are building a robotics startup.')
  m.remember('Their robotics startup is called Halcyon.')
  assert.equal(m.recall('halcyon robotics')[0].text, 'Their robotics startup is called Halcyon.')
  assert.equal(m.recall('')[0].text, 'Their robotics startup is called Halcyon.')
  assert.deepEqual(m.recall('submarine'), [])
})

test('forget removes one match and refuses an ambiguous description', () => {
  const m = openMemory(fresh('mem'))
  m.remember('They like black coffee.')
  m.remember('They like green tea.')
  const vague = m.forget({ query: 'they like' })
  assert.equal(vague.removed, null)
  assert.equal(vague.candidates.length, 2)
  assert.equal(m.count(), 2)
  assert.equal(m.forget({ query: 'coffee' }).removed.text, 'They like black coffee.')
  assert.equal(m.count(), 1)
  assert.equal(m.forget({ id: 'nope' }).removed, null)
})

test('long text is cut, empty text is refused, a corrupt file reads as empty', () => {
  const dir = fresh('mem')
  const m = openMemory(dir)
  assert.equal(m.remember('x'.repeat(2000)).entry.text.length, 400)
  assert.throws(() => m.remember('   '))
  writeFileSync(join(dir, 'memories.json'), '{not json')
  assert.equal(m.count(), 0)
})

test('the profile is read without its comments', () => {
  const dir = fresh('mem')
  const m = openMemory(dir)
  assert.equal(m.profile(), '') // the starter file is all comment
  writeFileSync(join(dir, 'profile.md'), '<!-- hint -->\nI run a bakery in Leeds.\n')
  assert.equal(m.profile(), 'I run a bakery in Leeds.')
  assert.match(m.prompt(), /bakery in Leeds/)
  assert.doesNotMatch(m.prompt(), /hint/)
})

test('the prompt stays inside its budget however much is remembered', () => {
  const m = openMemory(fresh('mem'))
  for (let i = 0; i < 300; i++) m.remember(`Fact number ${i} about something reasonably long to say.`)
  const p = m.prompt()
  assert.ok(p.length < 9000, `prompt was ${p.length}`)
  assert.match(p, /Fact number 299/) // newest kept
  assert.match(p, /older entries are not shown/)
})

test('every shipped skill parses and is listed', () => {
  const s = openSkills({ userDir: fresh('skills') })
  const all = s.all()
  assert.ok(all.length >= 30, `only ${all.length} skills`)
  for (const k of all) assert.ok(k.description && k.body, k.name)
  assert.match(s.prompt(), /- morning-briefing: /)
  assert.ok(s.get('Morning Briefing'))
})

test('a user skill is picked up, overrides a built-in, and only it can be removed', () => {
  const userDir = fresh('skills')
  const s = openSkills({ userDir })
  s.save({ name: 'Friday Wrap Up', description: 'Close the week.', body: '1. List what shipped.' })
  assert.equal(s.get('friday-wrap-up').source, 'user')
  assert.match(readFileSync(join(userDir, 'friday-wrap-up.md'), 'utf8'), /^---\nname: friday-wrap-up\n/)
  writeFileSync(join(userDir, 'weather.md'), '---\nname: weather\ndescription: Mine.\n---\nLook outside.')
  assert.equal(s.get('weather').body, 'Look outside.')
  assert.equal(s.remove('friday-wrap-up'), true)
  assert.equal(s.get('friday-wrap-up'), null)
  assert.equal(s.remove('news-briefing'), false) // built-in
  assert.ok(s.get('news-briefing'))
})

test('a skill name cannot leave the skills folder', () => {
  const s = openSkills({ userDir: fresh('skills') })
  const saved = s.save({ name: '../../etc/evil', description: 'x', body: 'y' })
  assert.equal(saved.name, 'etc-evil')
  assert.equal(parseSkill('no front matter'), null)
  assert.throws(() => s.save({ name: '', description: 'x', body: 'y' }))
})

test('memory and skill tools run in read-only mode', () => {
  assert.equal(decideTool('mcp__jarvis_memory__remember'), true)
  assert.equal(decideTool('mcp__jarvis_memory__forget'), true)
  assert.equal(decideTool('mcp__jarvis_skills__skill'), true)
})
