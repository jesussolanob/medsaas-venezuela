import { BadRequestException, ForbiddenException, ParseUUIDPipe } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/test', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

async function pipeError(): Promise<unknown> {
  try {
    await new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'id' });
  } catch (e) {
    return e;
  }
  throw new Error('ParseUUIDPipe did not throw');
}

describe('GlobalExceptionFilter — Spanish messages', () => {
  const filter = new GlobalExceptionFilter();

  it('translates Nest Parse*Pipe "Validation failed (...)" messages', async () => {
    const { host, status, json } = makeHost();

    filter.catch(await pipeError(), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'HTTP_ERROR',
        message: 'El identificador o parámetro enviado no es válido.',
      }),
    );
  });

  it('translates Nest default messages such as "Forbidden resource"', () => {
    const { host, json } = makeHost();

    filter.catch(new ForbiddenException('Forbidden resource'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No tienes permisos para realizar esta acción.' }),
    );
  });

  it('keeps custom messages untouched', () => {
    const { host, json } = makeHost();

    filter.catch(new BadRequestException('La fecha no es válida'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'La fecha no es válida' }),
    );
  });
});
