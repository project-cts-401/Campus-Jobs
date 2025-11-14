const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('AIzaSyDiGbMn71PMaYJdeNm7_IIRIgH2Yil5m-E');

async function parseTranscript(filePath) {
  try {
    const pdfBuffer = fs.readFileSync(filePath);
    const base64Pdf = pdfBuffer.toString('base64');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are an expert at reading academic transcripts.
Analyze this academic transcript PDF and extract, for each academic year (from the first to last year), ALL subjects, marks, and statuses.

Return the information in EXACTLY this JSON format, and NOTHING else:
{
  "years": [
    {
      "year": "YEAR",
      "subjects": [
        {
          "code": "SUBJECT_CODE",
          "name": "SUBJECT_NAME",
          "mark": 85,
          "status": "PASS"
        }
      ],
      "average": 75.1
    }
  ],
  "overall_average": 76.8,
  "notes": "any relevant notes",
  "recommendations": "any recommendations based on trends, achievements, or issues in the transcript"
}

Important rules:
1. Extract every subject for every year available in the transcript.
2. For each year, show a 'subjects' array and the average mark for that year.
3. Calculate and show 'overall_average' for ALL years and ALL passed subjects together.
4. Only include subjects with status 'PASS', 'PASS WITH DISTINCTION', or 'SUPPLEMENTARY PASSED'.
5. Exclude all failed subjects from averages and lists.
6. All marks must be numbers between 0-100.
7. The top-level JSON must strictly follow the provided schema, and should be valid JSON only—no explanation or commentary outside the JSON.
8. Add meaningful recommendations based on performance patterns or notable achievements.
`;

    const response = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
      prompt,
    ]);

    const responseText = response.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: 'No valid JSON in Gemini response' };
    const parsedData = JSON.parse(jsonMatch[0]);

    if (parsedData.error) return { success: false, error: parsedData.error };

    // Defensive - always store subjects as flat array (for backward compatibility)
    let allSubjects = [];
    if (parsedData.years && Array.isArray(parsedData.years)) {
      parsedData.years.forEach(y => {
        if (y.subjects && Array.isArray(y.subjects)) {
          allSubjects.push(...y.subjects.map(s => ({ ...s, year: y.year })));
        }
      });
    }

    return {
      success: true,
      summary: parsedData,
      years: parsedData.years || [],
      subjects: allSubjects,
      overall_average: parsedData.overall_average,
      notes: parsedData.notes || "",
      recommendations: parsedData.recommendations || ""
    };

  } catch (error) {
    return { success: false, error: `Error parsing transcript: ${error.message}` };
  }
}

async function getTranscriptSummary(uploadedFileName) {
  const filePath = path.join(__dirname, '..', 'uploads', uploadedFileName);
  if (!fs.existsSync(filePath)) return { success: false, error: 'Transcript file not found' };
  return parseTranscript(filePath);
}

module.exports = {
  parseTranscript,
  getTranscriptSummary
};
