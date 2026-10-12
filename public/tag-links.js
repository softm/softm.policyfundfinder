import {safeText as e,normalizeTag} from './core.js';
export function tagSearchUrl(tag,base){const u=new URL(base);u.search='';u.hash='';u.searchParams.set('tag',normalizeTag(tag));return u.href;}
export function renderTagLinks(program,base,selected=''){return [...new Set((program.tags||[]).map(t=>String(t).replace(/^#+/,'').trim()).filter(Boolean))].map(tag=>`<a class="tag-link ${normalizeTag(tag)===normalizeTag(selected)?'selected':''}" href="${e(tagSearchUrl(tag,base))}" data-action="tag" data-tag="${e(tag)}" aria-label="${e(tag)} 태그 공고 조회">#${e(tag)}</a>`).join('');}
