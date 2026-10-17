export function privateAssetPath(value) {
  return value.includes('..')||value.split('/').some(p=>p.startsWith('.'))||
    /\.(?:map|env)$/i.test(value)||
    /^\/(?:node_modules|scripts|migrations|generated-artifacts|worker|backend|client\/src)(?:\/|$)/.test(value)||
    /^\/(?:server\.js|package(?:-lock)?\.json|vite\.config\.[^/]+)$/.test(value);
}
export function publicAssetBoundary(req,res,next) {
  if(privateAssetPath(req.path))return res.status(404).send('Not found');
  return next();
}
