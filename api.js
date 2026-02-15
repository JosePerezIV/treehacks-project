/**
 * Bramble API Integration
 * Claude API for product analysis and ethical scoring
 */

/**
 * Analyze product using Claude API
 * @param {string} productName - Name of the product
 * @param {Object} userPreferences - User's preferences (avoided brands, location, etc.)
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeProduct(productName, userPreferences = {}) {
  console.log('Bramble API: Analyzing product:', productName);

  try {

    // Build the prompt
    const prompt = buildAnalysisPrompt(productName, userPreferences);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Bramble API: API error:', errorData);

      if (response.status === 429) {
        throw new Error('API_RATE_LIMIT');
      } else {
        throw new Error(`API_ERROR: ${response.status}`);
      }
    }

    const data = await response.json();
    console.log('Bramble API: Raw response:', data);

    // Extract text from Claude's response
    const text = data.content[0].text;

    // Parse JSON, stripping markdown if present
    const analysis = parseClaudeResponse(text);

    console.log('Bramble API: Parsed analysis:', analysis);

    return analysis;

  } catch (error) {
    console.error('Bramble API: Error:', error);
    throw error;
  }
}

/**
 * Build analysis prompt for Claude
 */
function buildAnalysisPrompt(productName, userPreferences) {
  const avoidedBrands = userPreferences.avoidedBrands || [];
  const location = userPreferences.location || null;

  return `You are analyzing a product for ethical shopping purposes. The user is considering buying: "${productName}"

User's preferences:
- Brands to avoid: ${avoidedBrands.length > 0 ? avoidedBrands.join(', ') : 'None specified'}
- Location: ${location ? `${location.display}` : 'Not provided'}

Analyze this product and provide information about:
1. The parent company that manufactures or owns this product
2. An ethical score (0-100) based on labor practices, environmental impact, corporate ethics
3. Key ethical concerns (if any)
4. Product category
5. Types of ethical alternatives available
6. Cost-benefit analysis explaining why choosing alternatives matters
7. Keywords for finding local alternatives

Return ONLY valid JSON with this exact structure (no markdown, no code blocks, no explanation):
{
  "parentCompany": "Company Name",
  "ethicalScore": 0-100,
  "concerns": ["concern1", "concern2", "concern3"],
  "productCategory": "category name",
  "alternativeTypes": ["Local businesses", "Sustainable brands", "Fair trade options"],
  "costBenefitAnalysis": "A persuasive 2-3 sentence explanation of why choosing ethical alternatives for this product matters, focusing on real-world impact.",
  "suggestedStoreKeywords": ["keyword1", "keyword2", "keyword3"]
}

Important: Return ONLY the JSON object, no other text.`;
}

/**
 * Parse Claude's response, stripping markdown if present
 */
function parseClaudeResponse(text) {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();

    // Remove ```json and ``` markers
    cleanText = cleanText.replace(/^```json\s*/i, '');
    cleanText = cleanText.replace(/^```\s*/, '');
    cleanText = cleanText.replace(/```\s*$/, '');

    // Trim again
    cleanText = cleanText.trim();

    // Parse JSON
    const parsed = JSON.parse(cleanText);

    // Validate required fields
    if (!parsed.parentCompany || typeof parsed.ethicalScore !== 'number') {
      throw new Error('Invalid response structure');
    }

    // Ensure arrays exist
    parsed.concerns = parsed.concerns || [];
    parsed.alternativeTypes = parsed.alternativeTypes || [];
    parsed.suggestedStoreKeywords = parsed.suggestedStoreKeywords || [];

    // Clamp ethical score to 0-100
    parsed.ethicalScore = Math.max(0, Math.min(100, parsed.ethicalScore));

    return parsed;

  } catch (error) {
    console.error('Bramble API: Failed to parse response:', error);
    console.error('Bramble API: Raw text:', text);
    throw new Error('PARSE_ERROR');
  }
}

/**
 * Get fallback analysis when API fails
 */
function getFallbackAnalysis(productName) {
  return {
    parentCompany: 'Unknown',
    ethicalScore: 50,
    concerns: ['Unable to analyze - API unavailable'],
    productCategory: 'General',
    alternativeTypes: ['Local businesses', 'Sustainable options', 'Fair trade alternatives'],
    costBenefitAnalysis: 'Supporting local and ethical businesses helps build stronger communities, promotes fair labor practices, and reduces environmental impact.',
    suggestedStoreKeywords: ['local', 'sustainable', 'ethical']
  };
}

// Export functions if in module context
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzeProduct,
    getFallbackAnalysis
  };
}
