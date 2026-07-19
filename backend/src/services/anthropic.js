const Anthropic = require('@anthropic-ai/sdk')

// Cost-appropriate model for high-volume structured JSON (teardowns). One place
// to tune. (advisor.js still pins the older opus id; migrate it here later.)
const TEARDOWN_MODEL = 'claude-sonnet-5'

// Claude sometimes wraps JSON in markdown fences or adds preamble — strip that
// and extract the outermost object. (Lifted from advisor.js.)
function parseJsonResponse(text) {
  if (!text) throw new Error('empty response')
  try { return JSON.parse(text) } catch { /* fallthrough */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) { try { return JSON.parse(fence[1].trim()) } catch { /* fallthrough */ } }
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a !== -1 && b > a) { try { return JSON.parse(text.slice(a, b + 1)) } catch { /* fallthrough */ } }
  throw new Error('could not extract JSON from response')
}

const hasAnthropicKey = () => !!process.env.ANTHROPIC_API_KEY

// One-shot: system + user prompt → parsed JSON object. Throws if the key is
// missing or the response can't be parsed (callers decide how to degrade).
async function generateJson(system, prompt, { model = TEARDOWN_MODEL, maxTokens = 1500 } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model, max_tokens: maxTokens, system,
    messages: [{ role: 'user', content: prompt }],
  })
  const textBlock = message.content.find(b => b.type === 'text')
  return parseJsonResponse(textBlock?.text || '')
}

module.exports = { generateJson, parseJsonResponse, hasAnthropicKey, TEARDOWN_MODEL }
