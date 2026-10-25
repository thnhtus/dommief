// Ambient declarations cho virtual module của Vite (chỉ tồn tại dưới Vite).
// `default` là giá trị export default.
declare module 'virtual:dommief/routes' {
  const routes: import('../routesModule.js').RouteModule[];
  export default routes;
}

declare module 'virtual:dommief/site' {
  const site: import('../types.js').SiteData;
  export default site;
}

declare module 'virtual:dommief/search-index' {
  const manifest: import('./search-core.js').SearchManifest;
  export default manifest;
}
