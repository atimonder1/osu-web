# Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the GNU Affero General Public License v3.0.
# See the LICENCE file in the repository root for full licence text.

import FlagCountry from 'flag-country'
import { route } from 'laroute'
import Mod from 'mod'
import { PlayDetailMenu } from 'play-detail-menu'
import * as React from 'react'
import { a, div, tr, td } from 'react-dom-factories'
import { hasMenu } from 'score-helper'
import ScoreboardTime from 'scoreboard-time'
el = React.createElement
bn = 'beatmap-scoreboard-table'

export class ScoreboardTableRow extends React.PureComponent
  render: () =>
    { activated, index, score } = @props
    classMods = if activated then ['menu-active'] else ['highlightable']
    classMods.push 'first' if index == 0
    classMods.push 'friend' if @props.scoreboardType != 'friend' && osu.currentUserIsFriendsWith(score.user.id)
    classMods.push 'self' if score.user.id == currentUser.id

    cell = "#{bn}__cell"

    tr
      className: "clickable-row #{osu.classWithModifiers("#{bn}__body-row", classMods)}",

      td className: osu.classWithModifiers(cell, ['rank']),
        a
          className: "clickable-row-link #{bn}__rank"
          href: route('scores.show', mode: score.mode, score: score.best_id)
          "##{index+1}"

      td className: osu.classWithModifiers(cell, ["grade"]),
        div className: "score-rank score-rank--tiny score-rank--#{score.rank}"

      td className: osu.classWithModifiers(cell, ["score"]),
        osu.formatNumber(score.score)

      td className: osu.classWithModifiers(cell, ['perfect'] if score.accuracy == 1),
        "#{osu.formatNumber(score.accuracy * 100, 2)}%"

      td className: cell,
        if score.user.country_code
          a
            href: laroute.route 'rankings',
              mode: @props.beatmap.mode
              country: score.user.country_code
              type: 'performance'
            el FlagCountry,
              country: score.user.country
              modifiers: ['flat']

      td className: cell,
        a
          className: "#{bn}__user-link js-usercard"
          'data-user-id': score.user.id
          href: laroute.route 'users.show', user: score.user.id, mode: @props.beatmap.mode
          score.user.username

      td className: osu.classWithModifiers(cell, ['perfect'] if score.max_combo == @props.beatmap.max_combo),
        "#{osu.formatNumber(score.max_combo)}x"

      for stat in @props.hitTypeMapping
        td
          key: stat[0]
          className: osu.classWithModifiers(cell, ['zero'] if score.statistics["count_#{stat[1]}"] == 0),
          osu.formatNumber(score.statistics["count_#{stat[1]}"])

      td className: osu.classWithModifiers(cell, ['zero'] if score.statistics.count_miss == 0),
        osu.formatNumber(score.statistics.count_miss)

      td className: cell, _.round score.pp

      td className: osu.classWithModifiers(cell, ['time']),
        el ScoreboardTime,
          dateTime: score.created_at

      td className: osu.classWithModifiers(cell, ['mods']),
        div className: "#{bn}__mods",
          el(Mod, mod: mod, key: mod) for mod in score.mods

      td className: "#{bn}__popup-menu",
        if hasMenu(score)
          el PlayDetailMenu,
            { score }
