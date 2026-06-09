export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const prompt = `당신은 정수기 전문 비교 분석가입니다. 한국 소비자를 위해 정수기를 공인 인증 기준으로 비교합니다.

비교 대상: "${query}"
(모델명이면 해당 모델, URL이면 해당 페이지의 제품)

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력합니다.

{
  "productName": "제품 전체 모델명",
  "brand": "브랜드명",
  "rows": [
    {"label":"NSF 42","sub":"맛·염소 감소","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"ok or no or q","text":"표시텍스트","desc":"보조설명"}},
    {"label":"NSF 53","sub":"건강 유해물질","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"q","text":"❓ 공개 인증 미확인","desc":""}},
    {"label":"NSF 55B","sub":"UV 살균","espring":{"status":"ok","text":"✅ UV-C LED 기반 인증","desc":"세계 최초 NSF 55 인증"},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"NSF 401","sub":"신종 오염물질","espring":{"status":"ok","text":"✅ 공인 인증","desc":""},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"PFAS 제거","sub":"과불화화합물","espring":{"status":"ok","text":"✅ PFOA/PFOS + 7종","desc":""},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"미세플라스틱","sub":"필터 제거","espring":{"status":"ok","text":"✅ 99% 제거 (NSF 401)","desc":""},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"잔류의약품","sub":"약물·대사산물","espring":{"status":"ok","text":"✅ 19종 관련 근거","desc":""},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"UV 기술","sub":"살균 방식","espring":{"status":"ok","text":"UV-C LED 265~269nm","desc":"10년 설계 수명"},"other":{"status":"q","text":"표시텍스트","desc":""}},
    {"label":"NSF 372","sub":"무연 재질","espring":{"status":"ok","text":"✅ 인증","desc":""},"other":{"status":"q","text":"❓","desc":""}},
    {"label":"냉온수","sub":"편의 기능","espring":{"status":"no","text":"❌ 정수 전문","desc":""},"other":{"status":"q","text":"표시텍스트","desc":""}},
    {"label":"스마트 기능","sub":"앱·Wi-Fi","espring":{"status":"ok","text":"✅ Wi-Fi · 앱 지원","desc":""},"other":{"status":"q","text":"표시텍스트","desc":""}}
  ],
  "price": {
    "espring": {
      "total": "1,528,000원 (퍼싯) / 1,488,000원 (전환기)",
      "installment": "스마트페이 1,591,000원 · 월 약 44,194원 × 36개월"
    },
    "other": {
      "total": "공개 구매가 또는 구매가 미공개",
      "rental": "렌탈 월 OO원 × OO개월 = 총 OO원 (모를 경우 렌탈 정보 공개 미확인)"
    }
  },
  "tco": {
    "other_monthly": 렌탈 월비용 숫자만(모르면 0),
    "other_contract_months": 약정 개월수(모르면 60),
    "other_filter_annual": 연간 필터비 숫자만(렌탈 포함이면 0),
    "note": "10년 비용 산정 근거 한 줄"
  },
  "summary": "한국어 3문장 이내 비교 요약. 인증 관점 중심."
}

이스프링(New eSpring) 데이터는 위 형식 그대로 고정 사용하세요.
비교 제품은 실제 공개 정보 기준으로만 작성하고, 확인 안 되면 반드시 status q로 표기하세요.
URL이 입력된 경우 해당 제품 페이지 정보를 최대한 반영하세요.`;

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
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
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

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('JSON 파싱 실패. raw:', raw);
      return res.status(500).json({ error: 'JSON 파싱 실패' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
