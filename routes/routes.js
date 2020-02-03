const request = require('request');

// esri-australia credential
const client_id = '';
const client_secret = '';
const apiKey = "";
const featureServerUrl = '';

// ArcGIS Url
const oauth2Url = 'https://www.arcgis.com/sharing/rest/oauth2/token/';
const featureServerUrlApplyEdit = `${featureServerUrl}/applyEdits`;

const getFeatureData = (token) =>
  new Promise((resolve, reject) => {
    request(
      {
        url: `${featureServerUrl}/query?token=${token}&where=1%3D1&f=json&outFields=OBJECTID, siteID, siteName`,
        headers: {},
        method: 'GET',
        encoding: null
      },
      function (error, res, body) {
        if (res.statusCode == 200 && !error) {
          resolve(JSON.parse(body));
        }
        reject(error);
      }
    );
  });


const getSourceData = siteId =>
  new Promise((resolve, reject) => {
    const sourceUrl = ``
    request(
      {
        url: sourceUrl,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        method: 'GET',
        encoding: null
      },
      function (error, res, body) {
        if (res.statusCode == 200 && !error) {
          resolve(JSON.parse(body));
        }
        reject(error);
      }
    );
  });

const applyEdit = (updateData, token) =>
  new Promise((resolve, reject) => {
    const updates = updateData.map(data => {
      return {
        attributes: {
          OBJECTID: data.objectId,
          siteName: data.siteName,
          siteType: data.siteType,
          since: data.since,
          until: data.until,
          healthParameter: data.healthParameter,
          healthAdvice: data.healthAdvice,
          averageValue: data.averageValue
        }
      };
    });
    console.log(`updates: ${JSON.stringify(updates)}`);

    request.post(
      {
        url: featureServerUrlApplyEdit,
        json: true,
        formData: {
          updates: JSON.stringify(updates),
          f: 'json',
          token: token
        }
      },
      function (error, response, body) {
        if (response.statusCode == 200 && !error) {
          //resolve(JSON.parse(response));
          resolve(body);
        }
        reject(error);
      }
    );
  });


const requestToken = () =>
  // generate a token with client id and client secret
  new Promise((resolve, reject) => {
    request.post(
      {
        url: oauth2Url,
        json: true,
        form: {
          f: 'json',
          client_id,
          client_secret,
          grant_type: 'client_credentials',
          expiration: '1440'
        }
      },
      function (error, response, { access_token }) {
        if (error) reject(error);

        resolve(access_token);
      }
    );
  });


const appRouter = app => {

  app.get('/', async (req, res) => {

    console.log("Synchronization started.")
    try {

      //1. Request tokens from ArcGIS online
      const token = await requestToken();
      console.log(`token: ${token}`);

      //2. Get feature data
      const featureData = await getFeatureData(token);

      console.log(`No of stations: ${featureData.features.length}`);

      let arrUpdates = [];

      for (let index = 0; index < featureData.features.length; index++) {

        const objectId = featureData.features[index].attributes.OBJECTID;
        const siteID = featureData.features[index].attributes.siteID;
        const siteName = featureData.features[index].attributes.siteName;

        try {

          //console.log(`Reading values from siteName: ${siteName}`);
          const sourcedata = await getSourceData(siteID);

          const updatedData = {
            objectId: objectId,
            siteID: sourcedata.siteID,
            siteName: sourcedata.siteName,
            siteType: sourcedata.siteType,
            since: sourcedata.siteHealthAdvices[0].since,
            until: sourcedata.siteHealthAdvices[0].until,
            healthParameter: sourcedata.siteHealthAdvices[0].healthParameter,
            healthAdvice: sourcedata.siteHealthAdvices[0].healthAdvice,
            averageValue: sourcedata.siteHealthAdvices[0].averageValue
          };

          arrUpdates.push(updatedData);

        } catch (error) {
          console.log(`error description: ${error}`);
        }
      }

      console.log(`Updating ${arrUpdates.length} ...`);
      const result = await applyEdit(arrUpdates, token);
      res
        .status(200)
        .send(res.body);
      return;
    } catch (e) {
      console.log(e);
    }

    console.log("Synchronization completed.")
  });
};

module.exports = appRouter;
