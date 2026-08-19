/**
 * Logs a message to the console.
 */
export const log = (message, data = {}) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
      ...data
    })
  );
};

/**
 * The CORS headers for the API.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*'
};

export const apiResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
};
