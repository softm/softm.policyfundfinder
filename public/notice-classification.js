// Conservative, explainable search classifications. These are discovery aids, not legal eligibility decisions.
const LOAN = /(?:융자|대출|정책자금|저리\s*자금)/;
const INTEREST = /(?:이차\s*보전|이자\s*차액\s*보전|이자(?:비용|금액)?\s*(?:지원|보전)|대출\s*이자\s*(?:지원|보전)|금리\s*(?:보전|지원))/;
const GUARANTEE = /(?:특례\s*보증|신용\s*보증|보증(?:서|료)?\s*(?:지원|발급)|보증료)/;
const GRANT = /(?:보조금|지원금|장려금|사업비\s*(?:보조|지원)|비용\s*(?:지원|보조)|현금\s*지원|지급\s*지원)/;
const VOUCHER = /(?:바우처|바우쳐|이용권\s*(?:제공|지원))/;
const SERVICE = /(?:컨설팅|멘토링|전문가\s*자문|기술\s*지도|교육\s*(?:생|과정|프로그램|지원)|세미나|설명회|포럼|워크숍|상담회|전시회|박람회|행사\s*(?:참가|개최)|입주\s*(?:기업|공간)|공간\s*제공)/;
const ONLY_INFO = /(?:모집\s*안내|설명회|세미나|포럼|컨퍼런스|행사|교육|강좌|특강|워크숍)/;
const TAG_FACILITY = new Set(['시설·환경 개선','장비설비지원','입주·임대 지원']);
const GRANT_TAGS = new Set(['보조금','지원금']);
const LOAN_TAGS = new Set(['대출','융자']);
const MONEY = new Set(['지원금','정책융자','이자지원','금융지원','복합지원']);
const text = v => String(v ?? '').normalize('NFKC').trim();
const has = (values, name) => values.includes(name);
function trust(textValue){return textValue&&!/^(?:지원 내용 상세 확인|공고 상세 정보를 아직 수집하지 못했습니다|원문 확인|지원 내용은 공식 공고|상세 지원내용 원문 확인)/.test(textValue);}
function pickType(p, tags) {
  const title=text(p.fullTitle||p.title);
  const detail=[p.supportText,p.supportContent,p.benefit].map(text).filter(trust).join(' ');
  const subtype=text(p.subcategory);
  const methods=(p.sourceSupportMethods||[]).map(text).join(' ');
  const interest=INTEREST.test(title);
  const loan=LOAN.test(title)||subtype==='융자';
  const grant=GRANT.test(title);
  if(VOUCHER.test(title)||subtype.includes('바우처'))return ['바우처','제목·원천 세부분류'];
  if(interest&&loan)return ['금융지원','제목: 융자와 이자보전'];
  if(interest)return ['이자지원','제목'];
  if(loan&&grant)return ['복합지원','제목: 융자와 보조금'];
  if(loan)return ['정책융자','제목·원천 세부분류'];
  if(GUARANTEE.test(title)||subtype==='보증')return ['금융지원','제목·원천 세부분류'];
  if(grant)return ['지원금','제목'];
  // Information events and courses do not become cash grants just because a portal tagged them as grants.
  if(ONLY_INFO.test(title)&&SERVICE.test(title))return ['서비스·현물','제목: 교육·행사'];
  if(VOUCHER.test(methods)||VOUCHER.test(detail))return ['바우처','지원방식·내용'];
  const tagGrant=tags.some(t=>GRANT_TAGS.has(t));
  const tagLoan=tags.some(t=>LOAN_TAGS.has(t));
  if(INTEREST.test(methods))return ['이자지원','원천 지원방식'];
  if(LOAN.test(methods)&&GRANT.test(methods))return ['복합지원','원천 지원방식'];
  if(LOAN.test(methods))return ['정책융자','원천 지원방식'];
  if(GRANT.test(methods))return ['지원금','원천 지원방식'];
  if(tagGrant&&tagLoan){
    // Multiple upstream tags may refer to separate funding tracks; never guess a single cash benefit.
    if(INTEREST.test(detail))return ['금융지원','원천 태그·지원 내용'];
    return ['복합지원','원천 태그: 복수 지원방식'];
  }
  if(tagLoan)return ['정책융자','원천 태그'];
  if(tagGrant)return ['지원금','원천 태그'];
  if(INTEREST.test(detail))return ['이자지원','지원 내용'];
  if(LOAN.test(detail)&&GRANT.test(detail))return ['복합지원','지원 내용'];
  if(LOAN.test(detail))return ['정책융자','지원 내용'];
  if(GRANT.test(detail)&&/지원(?:액|금액|한도|비율)|지급|정산|자부담|사업비/.test(detail))return ['지원금','지원 내용'];
  if(GUARANTEE.test(detail)||p.category==='금융')return ['금융지원','원천 분야·내용'];
  if(SERVICE.test(title))return ['서비스·현물','제목'];
  return ['지원사업','방식 확인 필요'];
}
function pickPurpose(p,tags,type){
  const title=text(p.fullTitle||p.title);
  if(/운영비|운전자금|인건비|고용(?:장려|유지)금|경영안정자금|경영안정\s*자금/.test(title))return '운영비';
  if(/시설|설비|장비|기계|환경\s*개선|에너지\s*효율|임차료|점포\s*개선/.test(title)||tags.some(t=>TAG_FACILITY.has(t)))return '시설·장비';
  if(/마케팅|수출|해외\s*진출|판로|박람회|전시회|홍보/.test(title)||has(tags,'마케팅·홍보')||has(tags,'판로지원'))return '판로·홍보';
  if(p.category==='창업'||/창업\s*(?:사업화|패키지|자금)/.test(title))return '창업';
  if(MONEY.has(type)&&p.category==='금융')return '사업자금';
  if(p.category==='기술')return 'ESG·기술';
  if(p.category==='수출'||p.category==='내수')return '판로·홍보';
  return p.purpose||'기타';
}
function pickSubcategory(p,tags,type){
  if(p.subcategory)return p.subcategory; // Keep authoritative Bizinfo subcategories.
  if(type==='이자지원')return '이차보전';
  if(type==='정책융자')return '융자';
  if(type==='바우처')return '바우처';
  if(type==='복합지원')return '복합지원';
  if(type==='지원금'&&has(tags,'보조금'))return '보조금';
  if(type==='금융지원'&&GUARANTEE.test(p.title||''))return '보증';
  if(has(tags,'장비설비지원'))return '기술인력/장비지원';
  if(has(tags,'시설·환경 개선'))return '시설/입지지원';
  if(has(tags,'제품제작지원'))return '디자인/상품화/사업화';
  if(has(tags,'마케팅·홍보'))return '홍보지원';
  if(has(tags,'교육 및 육성'))return '교육/훈련/연수';
  if(has(tags,'입주·임대 지원'))return '시설/입지지원';
  if(has(tags,'행사'))return '행사';
  return '';
}
/**
 * Keep the original provider category; infer only support type/purpose and missing
 * middle categories. Ambiguous records stay broad or explicitly multi-method.
 */
export function classifyProgram(program){
  if(!program||typeof program!=='object')throw new TypeError('공고 자료가 필요합니다.');
  const tags=[...new Set((Array.isArray(program.tags)?program.tags:[]).map(text).filter(Boolean))];
  const [type,basis]=pickType(program,tags);
  return {...program,type,purpose:pickPurpose(program,tags,type),subcategory:pickSubcategory(program,tags,type),
    classificationBasis:basis,classificationInferred:true};
}
