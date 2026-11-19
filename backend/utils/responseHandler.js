// Standardized response handler

export const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

export const sendSuccess = (res, message, data = null, statusCode = 200) => {
  return sendResponse(res, statusCode, true, message, data);
};

export const sendError = (res, message, statusCode = 400, code = null) => {
  const response = {
    success: false,
    message
  };

  if (code) {
    response.code = code;
  }

  return res.status(statusCode).json(response);
};

