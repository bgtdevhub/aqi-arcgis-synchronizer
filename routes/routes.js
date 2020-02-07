const request = require('request');

// please specify your own credential
const client_id = '';
const client_secret = '';
const apiKey = '';
const featureServerUrl = '';

// Fix Url
const epaUrl = `https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites?environmentalSegment=air`;
const oauth2Url = 'https://www.arcgis.com/sharing/rest/oauth2/token/';
const featureServerUrlApplyEdit = `${featureServerUrl}/applyEdits`;

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

const getEpaSites = () =>
  new Promise((resolve, reject) => {
    request(
      {
        url: epaUrl,
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

const getArcGisSites = (token) =>
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

const updateArcGisSitesFeature = (updatedSites, token) =>
  new Promise((resolve, reject) => {
    const updates = updatedSites.map(data => {
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
          resolve(`sites has been updated successfuly.`);
        }
        reject(error);
      }
    );
  });

const addArcGisSitesFeature = (newSites, token) =>
  new Promise((resolve, reject) => {
    const adds = newSites.map(data => {
      return {
        geometry: {
          "x": data.geometry.lat,
          "y": data.geometry.lon,
          "spatialReference": {
            "wkid": 4326
          }
        },
        attributes: {
          siteId: data.siteId,
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

    request.post(
      {
        url: featureServerUrlApplyEdit,
        json: true,
        formData: {
          adds: JSON.stringify(adds),
          f: 'json',
          token: token
        }
      },
      function (error, response, body) {
        if (response.statusCode == 200 && !error) {
          resolve(`new sites has been added successfully.`);
        }
        reject(error);
      }
    );
  });

const deleteArcGisSitesFeature = (objectIds, token) => {
  return new Promise((resolve, reject) => {
    request.post(
      {
        url: featureServerUrlApplyEdit,
        json: true,
        formData: {
          deletes: JSON.stringify(objectIds),
          f: 'json',
          token: token
        }
      },
      function (error, response, body) {
        if (response.statusCode == 200 && !error) {
          resolve(`offline sites has been deleted successfully`);
        }
        reject(error);
      }
    );
  });
}

const appRouter = app => {
  app.get('/', async (req, res) => {
    console.log("Synchronization started.")
    try {

      let updatedSites = [];
      let newSites = [];
      let dropSites = [];

      //1. Request tokens from ArcGIS online
      const token = await requestToken();
      console.log(`token: ${token}`);

      //2- get all station data (siteId and the values)
      const epaSites = await getEpaSites();
      const arcGisSites = await getArcGisSites(token);

      //3- loop all epa sites to get all updated sites and new sites
      for (const epaSite of epaSites.records) {

        if (!epaSite.siteHealthAdvices) continue;

        const featureData = {
          OBJECTID: 0,
          siteId: epaSite.siteID,
          siteName: epaSite.siteName,
          siteType: epaSite.siteType,
          since: epaSite.siteHealthAdvices[0].since,
          until: epaSite.siteHealthAdvices[0].until,
          healthParameter: epaSite.siteHealthAdvices[0].healthParameter,
          healthAdvice: epaSite.siteHealthAdvices[0].healthAdvice,
          averageValue: epaSite.siteHealthAdvices[0].averageValue,
          geometry: {
            lon: epaSite.geometry.coordinates[0],
            lat: epaSite.geometry.coordinates[1]
          }
        };

        const existingSite = arcGisSites.features.find(site => site.attributes.siteID === featureData.siteId);
        if (existingSite) {
          featureData.OBJECTID = existingSite.attributes.OBJECTID;
          updatedSites.push(featureData);
        } else {
          console.log(`${featureData.siteName} is a new site (to be added)`);
          newSites.push(featureData);
        }
      }

      for (const site of arcGisSites.features) {
        if (!epaSites.records.find(x => x.siteID === site.attributes.siteID)) {
          console.log(`${site.attributes.siteName} has been offlined (to be removed).`);
          dropSites.push(site.attributes.OBJECTID);
        }
      }

      const updateResult = await updateArcGisSitesFeature(updatedSites, token);
      console.log(`${updatedSites.length} ${updateResult}`);

      if (newSites.length > 0) {
        const addResult = await addArcGisSitesFeature(newSites, token);
        console.log(`${newSites.length} ${addResult}`);
      }

      if (dropSites.length > 0) {
        const removeResult = await deleteArcGisSitesFeature(dropSites, token);
        console.log(`${dropSites.length} ${removeResult}`);
      }

      res.status(200).send('Synchronization completed.');

      return;

    } catch (error) {
      console.log(error);
    }
  });
};

module.exports = appRouter;

