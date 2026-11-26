import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e/ui-regression',workers:1,retries:0,timeout:45000,
 reporter:[['list'],['json',{outputFile:'../../attentive-test-results/browser-results.json'}],['html',{outputFolder:'../../attentive-test-results/browser-report',open:'never'}]],
 outputDir:'../../attentive-test-results/browser-artifacts',
 use:{baseURL:process.env.UI_TEST_BASE_URL||'http://127.0.0.1:3003',channel:'chrome',headless:true,locale:'en-GB',timezoneId:'Asia/Jakarta',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'tablet',use:{viewport:{width:1000,height:950}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],
});
