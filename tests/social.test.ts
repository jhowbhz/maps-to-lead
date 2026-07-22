import { describe, expect, it } from 'vitest';
import { classifyLink, contactUrls, findEmail, findSocialInHtml, routeSiteLink } from '../src/parsing/social';

describe('classifyLink', () => {
  it('reconhece instagram, facebook e site comum', () => {
    expect(classifyLink('https://www.instagram.com/ideale.tech')).toBe('instagram');
    expect(classifyLink('https://instagr.am/ideale')).toBe('instagram');
    expect(classifyLink('https://facebook.com/ideale')).toBe('facebook');
    expect(classifyLink('https://fb.me/ideale')).toBe('facebook');
    expect(classifyLink('https://www.ideale.tech/')).toBe('site');
  });

  it('none para vazio/URL inválida', () => {
    expect(classifyLink('')).toBe('none');
    expect(classifyLink('não-é-url')).toBe('none');
  });
});

describe('routeSiteLink', () => {
  it('roteia o link do Maps para o campo certo', () => {
    expect(routeSiteLink('https://instagram.com/x')).toEqual({ instagram: 'https://instagram.com/x', facebook: '', site: '' });
    expect(routeSiteLink('https://facebook.com/x')).toEqual({ instagram: '', facebook: 'https://facebook.com/x', site: '' });
    expect(routeSiteLink('https://loja.com.br')).toEqual({ instagram: '', facebook: '', site: 'https://loja.com.br' });
    expect(routeSiteLink('')).toEqual({ instagram: '', facebook: '', site: '' });
  });
});

describe('findEmail', () => {
  it('acha o primeiro email plausível', () => {
    expect(findEmail('fale conosco: contato@ideale.tech ou visite')).toBe('contato@ideale.tech');
  });

  it('ignora retina (@2x) e placeholders/imagens', () => {
    expect(findEmail('logo@2x.png e você@example.com')).toBe('');
    expect(findEmail('sprite@3x.jpg')).toBe('');
  });

  it('vazio quando não há email', () => {
    expect(findEmail('sem email aqui')).toBe('');
  });
});

describe('findSocialInHtml', () => {
  it('extrai instagram e facebook do HTML', () => {
    const html = `<a href="https://www.instagram.com/ideale.tech/">ig</a>
                  <a href="https://facebook.com/idealetech">fb</a>`;
    const r = findSocialInHtml(html);
    expect(r.instagram).toContain('instagram.com/ideale.tech');
    expect(r.facebook).toContain('facebook.com/idealetech');
  });

  it('ignora links de share/plugins do facebook', () => {
    const html = `<a href="https://facebook.com/sharer/sharer.php?u=x">share</a>`;
    expect(findSocialInHtml(html).facebook).toBe('');
  });
});

describe('contactUrls', () => {
  it('acha links de contato no HTML (resolvidos para absolutos)', () => {
    const html = '<a href="/contato">Contato</a> <a href="https://x.com/fale-conosco">fale</a>';
    const urls = contactUrls(html, 'https://x.com/');
    expect(urls).toContain('https://x.com/contato');
    expect(urls).toContain('https://x.com/fale-conosco');
  });

  it('cai em caminhos comuns quando não há link de contato', () => {
    const urls = contactUrls('<p>sem contato aqui</p>', 'https://x.com/');
    expect(urls).toContain('https://x.com/contato');
    expect(urls).toContain('https://x.com/fale-conosco');
  });
});
