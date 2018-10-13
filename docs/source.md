## OpenAQ Source

The `source` object is a data structure identifying the source of data for a region or country along with
the information about the adapter that is to be used to retrieve the information.

Sources list is located in the `sources/` directory.

### Adding new source

To add a source to the list, create a new JSON file (if necessary) in `sources/` directory that contains an array of sources.

The filename should be named following this convention `<iso-county-3166-2-letter-lowercase-code>.json`, for example:

* `us.json`
* `de.json`
* `gb.json`

### Source object properties

The source object must consist of the following properties:

* `sourceURL (String)` - the *informative* url about the source,
* `adapter (String)` - the module name of the adapter a file or directory residing in `./adapters`,
* `name (String)` - an *informative* source name
* `country (String)` - the country for which the data is provided
* `description (String)` - description of the source
* `contacts (Array<String>)` - a list of e-mail addresses for contact about the source
* `active (Boolean)` - is the source active or not (if not it will be omitted in fetch process)

Optional properties (used to add information to measurements):

* `type (Enum<government|research|other>)` - Region name
* `city (String)` - City name
* `location (String)` - Name of the location
* `mobile (Boolean)` - Is the source mobile

Additonally the whole object is passed to the adapter so anything can be added to the structure. Adapter usually use:

* `url (String)` - the url to use to fetch the data from
