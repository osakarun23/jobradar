const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Anthropic } = require("@anthropic-ai/sdk");

admin.initializeApp();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

exports.tailorCV = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const { cvContent, jobDescription } = data;

  if (!cvContent || !jobDescription) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "CV content and job description are required"
    );
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are an expert resume writer. I'll provide you with a CV and a job description. Your task is to suggest specific, targeted changes to the CV that would make it more compelling for this particular job. Focus on:
1. Reordering bullet points to emphasize most relevant experience
2. Rewording accomplishments to match job keywords
3. Highlighting specific skills mentioned in the job description
4. Quantifying results where possible

Original CV:
${cvContent}

Job Description:
${jobDescription}

Provide the tailored CV with change suggestions highlighted. Format the response as the improved CV text.`,
        },
      ],
    });

    const tailoredCV =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      tailoredCV,
      success: true,
    };
  } catch (error) {
    console.error("Error tailoring CV:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Error tailoring CV: " + error.message
    );
  }
});
