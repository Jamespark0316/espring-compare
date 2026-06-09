export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const systemPrompt = `당신은 JSON만 출력하는 API입니다. 절대로 JSON 외의 텍스트, 마크다운, 코드블록, 설명을 출력하지 마세요. 반드시 { 로 시작해서 } 로 끝나는 순수 JSON만 출력하세요.`;

  // URL 여부 감지
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  const inputDescription = isUrl
    ? `아래 URL의 제품 페이지를 분석하세요. URL에서 브랜드명과 정확한 제품명(모델명)을 반드시 추출하세요.\nURL: ${query}`
    : `아래 모델명의 정수기를 분석하세요: ${query}`;

  const userPrompt = `${inputDescription}

New eSpring과 비교하는 JSON을 출력하세요.

중요: productName은 반드시 실제 제품의 정확한 모델명(예: LG 퓨리케어 WS513SH)으로 채우세요. URL이나 알 수 없는 코드를 그대로 넣지 마세요.

아래 JSON 구조 그대로 채워서 출력하세요. 다른 텍스트 없이 JSON만:

{"productName":"정확한 제품 모델명","brand":"브랜드명","rows":[{"label":"NSF 42","sub":"맛·염소 감소","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"q","text":"❓ 공개 인증 미확인","desc":""}},{"label":"NSF 53","sub":"건강 유해물질","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"q","text":"❓ 공개 인증 미확인","desc":""}},{"label":"NSF 55B","sub":"UV 살균","espring":{"status":"ok","text":"✅ UV-C LED 기반 인증","desc":"세계 최초 NSF 55 인증"},"other":{"status":"q","text":"❓","desc":""}},{"label":"NSF 401","sub":"신종 오염물질","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"q","text":"❓","desc":""}},{"label":"PFAS 제거","sub":"과불화화합물","espring":{"status":"ok","text":"✅ PFOA/PFOS + 7종","desc":""},"other":{"status":"q","text":"❓","desc":""}},{"label":"미세플라스틱","sub":"필터 제거","espring":{"status":"ok","text":"✅ 99% 제거 (NSF 401)","desc":""},"other":{"status":"q","text":"❓","desc":""}},{"label":"잔류의약품","sub":"약물·대사산물","espring":{"status":"ok","text":"✅ 19종 관련 근거","desc":""},"other":{"status":"q","text":"❓","desc":""}},{"label":"UV 기술","sub":"살균 방식","espring":{"status":"ok","text":"UV-C LED 265~269nm","desc":"10년 설계 수명"},"other":{"status":"q","text":"해당 제품 UV 방식","desc":""}},{"label":"NSF 372","sub":"무연 재질","espring":{"status":"ok","text":"✅ 인증","desc":""},"other":{"status":"q","text":"❓","desc":""}},{"label":"냉온수","sub":"편의 기능","espring":{"status":"no","text":"❌ 정수 전문","desc":""},"other":{"status":"q","text":"해당 제품 냉온수 여부","desc":""}},{"label":"스마트 기능","sub":"앱·Wi-Fi","espring":{"status":"ok","text":"✅ Wi-Fi · 앱 지원","desc":""},"other":{"status":"q","text":"해당 제품 스마트 기능","desc":""}}],"price":{"espring":{"total":"1,528,000원 (퍼싯) / 1,488,000원 (전환기)","installment":"퍼싯: 선급금 298,000원+월 35,900원×36개월 / 전환기: 선급금 258,000원+월 35,900원×36개월"},"other":{"total":"해당 제품 구매가 (검색 결과 기준)","rental":"렌탈 월 OO원 × 약정개월 = 총 OO원 (공개 정보 없으면 렌탈 정보 미공개로 표기)"}},"tco":{"other_monthly":0,"other_contract_months":60,"other_filter_annual":0,"note":"렌탈 정보 기준"},"summary":"인증 관점 3문장 요약"}

규칙:
- espring 항목은 절대 변경하지 말 것
- other 항목만 실제 제품 정보로 채울 것  
- status는 ok(인증있음), no(없음), q(불확실) 중 하나
- JSON만 출력, 다른 텍스트 절대 금지`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', JSON.stringify(data));
      return res.status(500).json({ error: 'API 호출 실패', detail: data });
    }

    let raw = '';
    for (const block of data.content || []) {
      if (block.type === 'text') raw += block.text;
    }

    console.log('Raw response (first 300):', raw.substring(0, 300));

    let result = null;
    try {
      result = JSON.parse(raw.trim());
    } catch (e1) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.error('JSON 파싱 실패. raw:', raw);
          return res.status(500).json({ error: 'JSON 파싱 실패', raw: raw.substring(0, 500) });
        }
      } else {
        return res.status(500).json({ error: 'JSON 블록 없음', raw: raw.substring(0, 500) });
      }
    }

    // URL 입력인데 productName이 URL 그대로면 도메인명으로 대체
    if (isUrl && result.productName && result.productName.startsWith('http')) {
      try {
        const domain = new URL(query).hostname.replace('www.', '');
        result.productName = `${result.brand || domain} 제품`;
      } catch (e) {}
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
