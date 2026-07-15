import { HTTPError } from 'ky'

export const httpError = (status: number): HTTPError =>
  new HTTPError(new Response(null, { status }), new Request('https://bunny.test/'), {} as never)
