import fastifyAccepts from"@fastify/accepts";import fastifyCookie from"@fastify/cookie";import fastifyFormbody from"@fastify/formbody";import fastifyMultipart from"@fastify/multipart";import fastifyRequestContext from"@fastify/request-context";import fastifyStatic from"@fastify/static";import fastifyUrlData from"@fastify/url-data";import"dotenv/config";import Fastify from"fastify";import{renderToString}from"jsx-async-runtime";import{createHash}from"node:crypto";import{readFile,stat}from"node:fs/promises";import{join}from"node:path";const serverless=Fastify({logger:true,disableRequestLogging:process.env.NODE_ENV==="development",bodyLimit:Number(process.env.FASTIFY_BODY_LIMIT)||void 0});serverless.register(fastifyAccepts);serverless.register(fastifyCookie);serverless.register(fastifyFormbody);serverless.register(fastifyMultipart);serverless.register(fastifyRequestContext);serverless.register(fastifyUrlData);serverless.register(fastifyStatic,{root:["public","dist/browser"].map(dir=>join(process.cwd(),dir)),prefix:"/",wildcard:false});serverless.all("*",async(request,reply)=>{let response;const requestPath=request.urlData().path;const pathSegments=requestPath.split("/").filter(segment=>segment!=="").reduce((acc,segment)=>{acc.push((acc.length>0?acc[acc.length-1]:"")+"/"+segment);return acc},[]).reverse().concat("");const generateEdges=path=>{const edges=[];if(path){const lastSegment=path.lastIndexOf("/")+1;edges.push(`${path.substring(0,lastSegment)}[${path.substring(lastSegment)}]`)}edges.push(`${path}/[index]`);return edges};for(const pathname of[...pathSegments.slice().reverse().map(segment=>`routes${segment}/[...guard].js`),...generateEdges(pathSegments[0]).map(segment=>`routes${segment}.js`),...pathSegments.map(segment=>`routes${segment}/[...path].js`),...pathSegments.map(segment=>`routes${segment}/[404].js`)]){const modulePath=join(process.cwd(),"dist",pathname);try{(await stat(modulePath)).isFile()}catch{continue}const hash=process.env.NODE_ENV==="development"?"?"+createHash("sha1").update(await readFile(modulePath,"utf-8")).digest("hex"):"";response=await(await import(`${modulePath}${hash}`)).default({request,reply,...typeof response==="object"?response:{}});if(reply.sent){return}else if(pathname.endsWith("/[...guard].js")&&(response===void 0||!isJSX(response))){continue}else if(pathname.endsWith("/[404].js")){reply.status(404);break}else if(reply.statusCode===404){continue}else{break}}if(!reply.hasHeader("Content-Type")){reply.header("Content-Type","text/html; charset=utf-8")}if(isJSX(response)){return await renderToString(response)}else{return response}function isJSX(obj){return typeof obj==="object"&&"type"in obj&&"props"in obj}});var serverless_default=serverless;export{serverless_default as default};
