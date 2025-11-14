const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI('AIzaSyDiGbMn71PMaYJdeNm7_IIRIgH2Yil5m-E');

/**
 * Parse transcript using Gemini AI
 * @param {string} filePath - Path to PDF transcript file
 * @returns {Promise<{average: number, subjects: Array, success: boolean, error: string}>}
 */
async function parseTranscript(filePath) {
  try {
    // Read PDF file
    const pdfBuffer = fs.readFileSync(filePath);
    const base64Pdf = pdfBuffer.toString('base64');
    
    // Initialize Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    // Prepare the prompt for Gemini
    const prompt = `You are an expert at reading academic transcripts. 

Analyze this academic transcript PDF and extract ONLY the THIRD YEAR (Year 3, Level 3, or 2023) subjects and marks.

Return the information in EXACTLY this JSON format, and NOTHING else:
{
  "subjects": [
    {
      "code": "SUBJECT_CODE",
      "name": "SUBJECT_NAME",
      "mark": 85,
      "status": "PASS"
    }
  ],
  "year": "2023",
  "notes": "any relevant notes"
}

Important rules:
1. Extract ONLY third year subjects
2. Marks must be numbers between 0-100
3. Include all passed subjects (status: PASS, PASS WITH DISTINCTION, SUPPLEMENTARY PASSED)
4. Exclude FAILED subjects
5. Return valid JSON only - no explanation text
6. If you find the third year section, return the subjects
7. If you cannot find third year, return: {"error": "Third year not found", "subjects": []}`;

    // Call Gemini API with the PDF
    const response = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
      },
      prompt,
    ]);

    // Extract response text
    const responseText = response.response.text();
    
    console.log('Gemini Response:', responseText);
    
    // Parse the JSON response
    let parsedData;
    try {
      // Extract JSON from response (sometimes Gemini adds extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'No valid JSON in Gemini response'
        };
      }
      parsedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON:', parseError);
      return {
        success: false,
        error: `Failed to parse AI response: ${parseError.message}`
      };
    }

    // Check if error was returned
    if (parsedData.error) {
      return {
        success: false,
        error: parsedData.error
      };
    }

    // Extract subjects
    if (!parsedData.subjects || parsedData.subjects.length === 0) {
      return {
        success: false,
        error: 'No subjects found in third year'
      };
    }

    const subjects = parsedData.subjects;
    const marks = subjects.map(s => s.mark);

    // Calculate average
    const average = marks.reduce((a, b) => a + b, 0) / marks.length;

    console.log(`✓ Transcript parsed by Gemini: ${subjects.length} subjects, Average: ${average.toFixed(2)}%`);

    return {
      success: true,
      average: parseFloat(average.toFixed(2)),
      subjects: subjects.map(s => ({
        code: s.code,
        description: s.name,
        mark: s.mark,
        status: s.status
      })),
      subjectCount: subjects.length,
      marksUsed: marks
    };

  } catch (error) {
    console.error('Transcript parsing error:', error.message);
    return {
      success: false,
      error: `Error parsing transcript: ${error.message}`
    };
  }
}

/**
 * Get third year average from uploaded transcript
 * @param {string} uploadedFileName - Name of uploaded file in uploads folder
 * @returns {Promise<{average: number, subjects: Array, success: boolean}>}
 */
async function getThirdYearAverage(uploadedFileName) {
  const filePath = path.join(__dirname, '..', 'uploads', uploadedFileName);
  
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: 'Transcript file not found'
    };
  }
  
  return parseTranscript(filePath);
}

module.exports = {
  parseTranscript,
  getThirdYearAverage
};
