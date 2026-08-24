import { createClient } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free'
const FALLBACK_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

function openRouterHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'Kernel Surface Ledger',
  }
}

function jsonError(message: string, status: number) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function complete(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured')

  const attempt = async (model: string) => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders(apiKey),
      body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1200, reasoning: { exclude: true } }),
    })
    if (!response.ok) {
      const detail = await response.text()
      throw Object.assign(new Error(`OpenRouter ${response.status}: ${detail.slice(0, 400)}`), { status: response.status })
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
    if (data.error) throw Object.assign(new Error(data.error.message ?? 'OpenRouter upstream error'), { status: 502 })
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) throw Object.assign(new Error('OpenRouter returned an empty completion'), { status: 502 })
    return text
  }

  try {
    return await attempt(DEFAULT_MODEL)
  } catch (error) {
    const status = (error as { status?: number }).status
    if ([400, 404, 429, 502, 503].includes(status ?? 0)) return attempt(FALLBACK_MODEL)
    throw error
  }
}

function buildPrompt(context: string) {
  return [
    'You answer questions about one specific Kernel Surface Ledger report.',
    'Use ONLY the report. Never invent CVEs, weights, ids or numbers.',
    'The scoring engine is deterministic. Interpret its numbers; do not re-score.',
    'If the report cannot answer, say what is missing.',
    'Write for someone who knows Linux basics but is not a kernel engineer.',
    'Use the exact ids and figures from the report.',
    '',
    'OUTPUT FORMAT:',
    'ANSWER: one direct sentence naming the exact step or element ids.',
    'WHY: 3-6 short lines, each grounded in an exact figure and id.',
    'IN PLAIN TERMS: 2-4 short lines without jargon.',
    'WHAT IT COULD BREAK: concrete services/workflows from the report, or nothing observed.',
    'CHECK IT: 1-3 commands and what a good result looks like.',
    'REVERT IT: one exact revert instruction.',
    '',
    `REPORT\n${context.slice(0, 60000)}`,
  ].join('\n')
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return jsonError('Method not allowed', 405)

  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonError('Sign in to ask the report', 401)

  const supabaseUrl = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !publishableKey) return jsonError('Supabase server configuration is missing', 500)

  const supabase = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return jsonError('Your session is no longer valid — sign in again', 401)

  let body: { question?: unknown; context?: unknown; history?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonError('Malformed request body', 400)
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const context = typeof body.context === 'string' ? body.context : ''
  if (!question || context.length < 20) return jsonError('A question and a loaded report are both required', 400)

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
          !!m && typeof m === 'object' && ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant') && typeof (m as { content?: unknown }).content === 'string',
        )
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    : []

  try {
    const messages = [
      { role: 'system' as const, content: buildPrompt(context) },
      ...history,
      { role: 'user' as const, content: question.slice(0, 2000) },
    ]
    const text = await complete(messages)
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('ask-report failed:', error)
    return jsonError('The model provider is unavailable right now. Try again in a few seconds.', 502)
  }
}
