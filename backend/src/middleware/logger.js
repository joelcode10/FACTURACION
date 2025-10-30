export function logger(req, _res, next) {
  // Log básico por ahora; puedes persistir en SQL si deseas
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}
