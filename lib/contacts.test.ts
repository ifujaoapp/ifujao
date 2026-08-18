import { resolveContact, type RevealFn } from './contacts';

describe('resolveContact', () => {
  it('retorna o contato local quando presente (não chama reveal)', async () => {
    const reveal: RevealFn = jest.fn(async () => '55999999999');
    const result = await resolveContact({ id: 'pet-1', contact: '551199999' }, reveal);
    expect(result).toBe('551199999');
    expect(reveal).not.toHaveBeenCalled();
  });

  it('chama reveal com o petId quando o contato local está ausente', async () => {
    const reveal: RevealFn = jest.fn(async () => '55988887777');
    const result = await resolveContact({ id: 'pet-2' }, reveal);
    expect(result).toBe('55988887777');
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith('pet-2');
  });

  it('considera string vazia como ausente e usa reveal', async () => {
    const reveal: RevealFn = jest.fn(async () => '55977776666');
    const result = await resolveContact({ id: 'pet-3', contact: '' }, reveal);
    expect(result).toBe('55977776666');
    expect(reveal).toHaveBeenCalledWith('pet-3');
  });

  it('retorna null quando reveal falha', async () => {
    const reveal: RevealFn = jest.fn(async () => null);
    const result = await resolveContact({ id: 'pet-4' }, reveal);
    expect(result).toBeNull();
  });
});
