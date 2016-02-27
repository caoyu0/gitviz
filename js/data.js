var viz = viz || {};

// Data manipulation logic
viz.data = (function() {
  var API_BASE_URL = 'https://api.github.com';
  var API_USER = '/users/';
  var API_PUBLIC_EVENTS = '/events/public';
  var API_ORG = '/orgs/';
  var API_EVENTS = '/events';

  var _commits = {};

  var _commitsByDate = {};

  var module = {};

  var _filterPushEvents = function(event) {
    return event.type === 'PushEvent';
  };

  module.getOrgEvent = function(org, cb) {
    var url = API_BASE_URL + API_ORG + org + API_EVENTS;
    d3.json(url)
      .header('Authorization', 'Basic cGFyYWRpdGU6YTFhY2MzM2FlZDU2ZGE5OTg4YzY1NGJkMjQxNzdiZTY1NjFkZTllZQ==')
      .get(function(err, data) {
        if (err) {
          console.log(err);
        } else {
          console.log(data.filter(_filterPushEvents));
          // _updateCommitsFromPushes(user, data.filter(_filterPushEvents));
          // _fetchCommitDetails(user, cb);
        }
      });
  };

  module.getPubEvent = function(user, cb) {
    // console.log(user);
    var url = API_BASE_URL + API_USER + user.username + API_PUBLIC_EVENTS;
    d3.json(url)
      .header('Authorization', 'Basic cGFyYWRpdGU6YTFhY2MzM2FlZDU2ZGE5OTg4YzY1NGJkMjQxNzdiZTY1NjFkZTllZQ==')
      .get(function(err, data) {
        if (err || data.length === 0) {
          console.log(err);
          cb('GitHub API error', null, null);
          return;
        }

        // get user details
        var userDetailUrl = API_BASE_URL + API_USER + user.username;
        d3.json(userDetailUrl)
          .header('Authorization', 'Basic cGFyYWRpdGU6YTFhY2MzM2FlZDU2ZGE5OTg4YzY1NGJkMjQxNzdiZTY1NjFkZTllZQ==')
          .get(function(err, userdata) {
            if (err || userdata.length === 0) {
              console.log(err);
              return;
            }
            if (userdata.email && user.email === null) {
              user.email = userdata.email;
            }
            if (userdata.email === null && user.email === null) {
              cb('No GitHub public email for ' + user.username + ', please enter mannually', null, null);
              return;
            }
            user.name = userdata.name;
            _updateCommitsFromPushes(user, data.filter(_filterPushEvents));
            _fetchCommitDetails(user, cb);
          });
      });
  };

  var _updateCommitsFromPushes = function(user, data) {
    _commits[user.username] = [];
    data.forEach(function(event) {
      if (event['payload']['commits']) {
        event['payload']['commits'].forEach(function(commit) {
          if (isCommitValid(user, commit)) {
            _commits[user.username].push(commit);
          } else {
            // console.log("commit from others");
            // console.log(commit["author"]["email"]);
          }
        });
      }
      // _commits[user] = _commits[user].concat(event["payload"]["commits"]);
    });
  };

  var isCommitValid = function(user, commit) {
    if (user.email === (commit['author']['email'])) {
      return true;
    } else {
      return false;
    }
  };

  var _fetchCommitDetails = function(user, cb) {
    if (!_commits[user.username]) {
      console.log('user does not exist or empty commits');
      cb('User does not exist or have empty commits', null, null);
      return;
    }

    _commitsByDate[user.username] = [];

    _commits[user.username].forEach(function(d) {
      _fetchCommitDetail(user, cb, d);
    });
  };

  var _fetchCommitDetail = function(user, cb, d) {
    d3.json(d.url)
      .header('Authorization', 'Basic cGFyYWRpdGU6YTFhY2MzM2FlZDU2ZGE5OTg4YzY1NGJkMjQxNzdiZTY1NjFkZTllZQ==')
      .get(function(err, res) {
        _handleCommitDetail(user, cb, err, res);
      });
  };

  var _handleCommitDetail = function(user, cb, err, res) {
    if (err) {
      console.log(err);
    } else {
      // console.log(res);
      // console.log(res["commit"]["author"]["date"]);
      var commitDate = viz.util.parseDate(res['commit']['author']['date']);
      // Expose date at outer level
      res['date'] = commitDate;

      if (isCommitTooEarly(commitDate)) {
        // console.log("too ealry");
        return;
      }
      // d.date = commitDate;
      // console.log(formatDateOnly(commitDate));
      var dateOnly = viz.util.formatDateOnly(commitDate);
      addCommitByDate(user, dateOnly, res);
      cb(null, user, getCommitByDate(user));
    }
  };

  var addCommitByDate = function(user, date, commit) {
    for (var i = 0; i < _commitsByDate[user.username].length; i++) {
      if (_commitsByDate[user.username][i]['dateStr'] === date) {
        _commitsByDate[user.username][i]['commits'].push(commit);
        return;
      }
    }

    // Date not added yet
    _commitsByDate[user.username].push({
      dateStr: date,
      date: viz.util.formatDateOnly.parse(date),
      commits: [commit],
      name: commit['commit']['author']['name'],
      username: commit['author']['login']
    });
  };

  var getCommitByDate = function(user) {
    return _commitsByDate[user.username];
  };

  // var _sortTime = function(d1, d2) {
  //   if (d1.date < d2.date) {
  //     return -1;
  //   } else if (d1.date === d2.date) {
  //     return 0;
  //   } else {
  //     return 1;
  //   }
  // };

  var _ValidDateEarliest = new Date(2016, 0, 11); // Semester start at Jan 11

  var isCommitTooEarly = function(date) {
    return date < _ValidDateEarliest;
  };

  module.getDomain = function(accessor) {
    var domains = [];
    for (var userkey in _commitsByDate) {
      if (_commitsByDate.hasOwnProperty(userkey)) {
        var userCommits = _commitsByDate[userkey];
        domains = domains.concat(d3.extent(userCommits, accessor));
      }
    }
    var dates = d3.extent(domains);
    // Round to next day for last date
    return [dates[0], d3.time.day.offset(dates[1], 1)];
  };

  module.MAX_COMMITS = 5;

  module.getPrimaryTooltipData = function(d) {
    return d.username + '(' + d.name + ') ' + viz.util.formatDateNice(d.date);
  };

  module.getAdditionalTooltipData = function(d) {
    return '... and ' + (d.commits.length - module.MAX_COMMITS) + ' more commits';
  };

  module.getSecondaryTooltipDataByIndex = function(d, i) {
    return _getCommitTime(d.commits[i]) + ' ' + _getStatsContent(d.commits[i]) + ' ' + _getCommitMessage(d.commits[i]);
  };

  function _getCommitTime(commit) {
    return viz.util.formatTime(commit.date);
  }

  function _getCommitMessage(commit) {
    return commit['commit']['message'];
  }

  function _getStatsContent(commit) {
    return '<span class="addition">+' + commit.stats.additions + '</span> <span class="deletion">-' + commit.stats.deletions + '</span>';
  }

  module.sizeAccessor = function(d) {
    if (d.commits && Array.isArray(d.commits)) {
      return d.commits.length;
    } else {
      return 0;
    }
  };

  module.dateAccessor = function(d) {
    if (d.date) {
      return d.date;
    } else {
      return null;
    }
    // console.log(d.date);
  };

  return module;
})();
